(() => {
  // One AudioContext and gain node per page. Re-use across all media elements.
  let audioCtx = null;
  let gainNode = null;
  let currentGain = 1.0;

  // Track which elements have already been wired up to avoid double-processing.
  const wired = new WeakSet();

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContext();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = currentGain;
      gainNode.connect(audioCtx.destination);
    }
    return { audioCtx, gainNode };
  }

  function wireElement(el) {
    if (wired.has(el)) return;
    wired.add(el);

    const { audioCtx, gainNode } = getAudioContext();

    // Resume context on first user interaction if it was suspended.
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    try {
      const source = audioCtx.createMediaElementSource(el);
      source.connect(gainNode);
    } catch (e) {
      // createMediaElementSource throws if the element is cross-origin tainted
      // or has already been captured by another AudioContext — nothing we can do.
    }
  }

  function wireAll() {
    document.querySelectorAll("audio, video").forEach(wireElement);
  }

  // Wire elements that are already in the DOM.
  wireAll();

  // Watch for elements added dynamically (e.g. YouTube loads its <video> late).
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches("audio, video")) {
          wireElement(node);
        } else {
          node.querySelectorAll?.("audio, video").forEach(wireElement);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also re-wire on play events — catches elements that exist but weren't
  // wired because the page hadn't loaded media yet.
  document.addEventListener("play", (e) => {
    if (e.target instanceof HTMLMediaElement) wireElement(e.target);
  }, true);

  // Message handler from the popup.
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SET_GAIN") {
      currentGain = msg.gain;
      if (gainNode) {
        gainNode.gain.value = currentGain;
      }
      // If AudioContext hasn't been created yet, it will pick up currentGain
      // when the first media element is wired.
    } else if (msg.type === "GET_GAIN") {
      return Promise.resolve({ gain: currentGain });
    }
  });
})();
