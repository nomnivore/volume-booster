(() => {
  function pageScript() {
    let audioCtx = null;
    let gainNode = null;
    let gainParam = null;
    let userGain = 1.0;
    let nativeVolume = 1.0;

    // Map el → MediaStreamSourceNode so we can disconnect on unwire.
    const wired = new Map();
    // Map el → stream, deferred until AudioContext is running.
    const pending = new Map();

    const proto = HTMLMediaElement.prototype;
    const protoGet = Object.getOwnPropertyDescriptor(proto, "volume").get;
    const protoSet = Object.getOwnPropertyDescriptor(proto, "volume").set;

    function applyGain() {
      if (gainParam) gainParam.value = userGain * nativeVolume;
    }

    function ensureCtx() {
      if (audioCtx && audioCtx.state !== "closed") return;
      audioCtx = new AudioContext();
      gainNode = audioCtx.createGain();
      gainParam = gainNode.gain;
      gainParam.value = userGain * nativeVolume;
      gainNode.connect(audioCtx.destination);

      audioCtx.addEventListener("statechange", () => {
        if (audioCtx.state === "running") {
          for (const [el, stream] of [...pending]) {
            pending.delete(el);
            doWire(el, stream);
          }
        }
      });
    }

    function doWire(el, stream) {
      if (wired.has(el)) return;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(gainNode);
      wired.set(el, source);

      nativeVolume = protoGet.call(el);
      protoSet.call(el, 0);
      applyGain();

      Object.defineProperty(el, "volume", {
        configurable: true,
        enumerable: true,
        get() { return nativeVolume; },
        set(v) {
          nativeVolume = Math.max(0, Math.min(1, v));
          applyGain();
        },
      });

      // When YouTube (SPA) loads a new src into the same element, unwire it
      // so the next play event can re-wire the fresh stream.
      el.addEventListener("emptied", () => unwireElement(el), { once: true });
    }

    function unwireElement(el) {
      const source = wired.get(el);
      pending.delete(el);
      if (!source) return;
      wired.delete(el);
      source.disconnect();
      // Restore native volume and remove our volume property override.
      protoSet.call(el, 1.0);
      try { delete el.volume; } catch {}
    }

    async function wireElement(el) {
      if (wired.has(el)) return;

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
})();
