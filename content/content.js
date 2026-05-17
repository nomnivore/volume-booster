(() => {
  function pageScript() {
    let audioCtx = null;
    let userGain = 1.0;
    let active = true;

    // Map el → MediaStreamSourceNode so we can disconnect on unwire.
    const wired = new Map();
    // Map el → stream, deferred until AudioContext is running.
    const pending = new Map();
    const mutedListeners = new WeakSet();

    const proto = HTMLMediaElement.prototype;
    const protoGet = Object.getOwnPropertyDescriptor(proto, "volume").get;
    const protoSet = Object.getOwnPropertyDescriptor(proto, "volume").set;

    function applyGain() {
      for (const { gainParam, nativeVolume } of wired.values()) {
        gainParam.value = userGain * nativeVolume;
      }
    }

    function ensureCtx() {
      if (audioCtx && audioCtx.state !== "closed") return;
      audioCtx = new AudioContext();
      audioCtx.addEventListener("statechange", () => {
        if (audioCtx.state === "running") {
          for (const [el, stream] of [...pending]) {
            pending.delete(el);
            doWire(el, stream);
          }
        } else if (audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }
      });
    }

    function doWire(el, stream) {
      if (wired.has(el)) return;

      const source = audioCtx.createMediaStreamSource(stream);
      const gainNode = audioCtx.createGain();
      const gainParam = gainNode.gain;
      const nativeVolume = protoGet.call(el);
      gainParam.value = userGain * nativeVolume;
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      wired.set(el, { source, gainNode, gainParam, nativeVolume });
      protoSet.call(el, 0);

      Object.defineProperty(el, "volume", {
        configurable: true,
        enumerable: true,
        get() {
          const entry = wired.get(el);
          return entry ? entry.nativeVolume : protoGet.call(el);
        },
        set(v) {
          const entry = wired.get(el);
          if (entry) {
            entry.nativeVolume = Math.max(0, Math.min(1, v));
            entry.gainParam.value = userGain * entry.nativeVolume;
          }
        },
      });

      // When YouTube (SPA) loads a new src into the same element, unwire it
      // so the next play event can re-wire the fresh stream.
      el.addEventListener("emptied", () => unwireElement(el), { once: true });
    }

    function unwireElement(el) {
      const entry = wired.get(el);
      pending.delete(el);
      if (!entry) return;
      wired.delete(el);
      entry.source.disconnect();
      entry.gainNode.disconnect();
      protoSet.call(el, entry.nativeVolume);
      try { delete el.volume; } catch {}
    }

    async function wireElement(el) {
      if (!active) return;
      if (wired.has(el)) return;

      if (el.muted) {
        if (!mutedListeners.has(el)) {
          mutedListeners.add(el);
          el.addEventListener("volumechange", () => {
            if (!el.muted) {
              mutedListeners.delete(el);
              wireElement(el);
            }
          });
        }
        return;
      }

      const stream = el.captureStream?.() || el.mozCaptureStream?.();
      if (!stream) return;

      if (stream.getAudioTracks().length === 0) {
        // Audio tracks not loaded yet — retry as soon as one appears.
        stream.addEventListener("addtrack", () => wireElement(el), { once: true });
        return;
      }

      ensureCtx();

      if (audioCtx.state === "suspended") {
        await audioCtx.resume().catch(() => {});
      }

      if (audioCtx.state !== "running") {
        pending.set(el, stream);
        return;
      }

      if (wired.has(el)) return; // guard against race after await
      doWire(el, stream);
    }

    new MutationObserver((mutations) => {
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches("audio, video")) wireElement(node);
          else node.querySelectorAll?.("audio, video").forEach(wireElement);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("play", (e) => {
      if (e.target instanceof HTMLMediaElement) wireElement(e.target);
    }, true);

    document.addEventListener("click", () => {
      if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
    }, true);

    Object.defineProperty(window, "__vbSetGain__", {
      configurable: true,
      set(value) {
        userGain = value;
        applyGain();
      },
    });

    Object.defineProperty(window, "__vbGetGain__", {
      configurable: true,
      get() { return userGain; },
    });

    Object.defineProperty(window, "__vbSetActive__", {
      configurable: true,
      set(value) {
        if (value) {
          active = true;
          // Wire any elements currently playing so activation works mid-playback.
          document.querySelectorAll("audio, video").forEach((el) => {
            if (!el.paused) wireElement(el);
          });
        } else {
          active = false;
          for (const el of [...wired.keys()]) {
            unwireElement(el);
          }
          pending.clear();
        }
      },
    });
  }

  const s = document.createElement("script");
  s.textContent = `(${pageScript.toString()})()`;
  (document.head || document.documentElement).appendChild(s);
  s.remove();

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SET_GAIN") {
      window.wrappedJSObject.__vbSetGain__ = msg.gain;
    } else if (msg.type === "GET_GAIN") {
      return Promise.resolve({ gain: window.wrappedJSObject.__vbGetGain__ ?? 1.0 });
    }
  });

  function isHttpOrigin(origin) {
    return origin.startsWith("http://") || origin.startsWith("https://");
  }

  async function applyActiveState() {
    const origin = window.location.origin;
    // Non-http(s) origins (about:, moz-extension:, etc.) are always active.
    if (!isHttpOrigin(origin)) {
      window.wrappedJSObject.__vbSetActive__ = true;
      return;
    }

    let settings;
    try {
      const result = await browser.storage.local.get("settings");
      settings = result.settings;
    } catch {
      settings = null;
    }

    let shouldBeActive;
    if (!settings || typeof settings !== "object") {
      // Missing or malformed — default to always-on.
      shouldBeActive = true;
    } else if (settings.mode === "whitelist") {
      const list = Array.isArray(settings.whitelist) ? settings.whitelist : [];
      shouldBeActive = list.includes(origin);
    } else {
      // "always-on" or any unrecognised mode.
      shouldBeActive = true;
    }

    window.wrappedJSObject.__vbSetActive__ = shouldBeActive;
  }

  applyActiveState();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "settings" in changes) {
      applyActiveState();
    }
  });
})();
