(() => {
  function pageScript() {
    let audioCtx = null;
    let gainNode = null;
    let gainParam = null;
    let userGain = 1.0;
    let nativeVolume = 1.0;
    const wired = new WeakSet();
    const pending = new Set();

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
          for (const el of [...pending]) {
            pending.delete(el);
            wireElement(el);
          }
        }
      });
    }

    async function wireElement(el) {
      if (wired.has(el)) return;

      const stream = el.captureStream?.() || el.mozCaptureStream?.();
      if (!stream || stream.getAudioTracks().length === 0) return;

      ensureCtx();

      // Try to resume. If we're in a user gesture context (play/click) this
      // resolves immediately. If not, the statechange listener will retry.
      if (audioCtx.state === "suspended") {
        await audioCtx.resume().catch(() => {});
      }

      // Only mute native output once we're sure the context is running.
      // If it's still suspended here, park the element and wait.
      if (audioCtx.state !== "running") {
        pending.add(el);
        return;
      }

      if (wired.has(el)) return; // guard against race after await
      wired.add(el);

      audioCtx.createMediaStreamSource(stream).connect(gainNode);

      // Mute the element's native output and proxy its volume so
      // YouTube's own slider continues to scale our gain correctly.
      const proto = HTMLMediaElement.prototype;
      const nativeGet = Object.getOwnPropertyDescriptor(proto, "volume").get;
      const nativeSet = Object.getOwnPropertyDescriptor(proto, "volume").set;

      nativeVolume = nativeGet.call(el);
      nativeSet.call(el, 0);
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

    // Clicks can unlock a suspended AudioContext and flush pending elements.
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
