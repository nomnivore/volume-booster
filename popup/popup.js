const slider = document.getElementById("volumeSlider");
const valueDisplay = document.getElementById("volumeValue");
const resetBtn = document.getElementById("resetBtn");
const tick100 = document.getElementById("tick100");
const modeToggle = document.getElementById("modeToggle");
const siteRow = document.getElementById("siteRow");
const siteLabel = document.getElementById("siteLabel");
const siteToggle = document.getElementById("siteToggle");
const manageSitesLink = document.getElementById("manageSitesLink");
const volumeSection = document.getElementById("volumeSection");
const whitelistSection = document.getElementById("whitelistSection");

// Quadratic mapping: slider pos 0–200 → display 0–400%
// f(pos) = pos² / 100  →  f(100)=100, f(200)=400
// Inverse: pos = sqrt(pct) * 10
function sliderToPercent(pos) {
  return Math.round(pos * pos / 100);
}

function percentToSlider(pct) {
  return Math.round(Math.sqrt(pct) * 10);
}

function updateUI(sliderPos) {
  const value = sliderToPercent(sliderPos);
  valueDisplay.textContent = value;

  if (value > 100) {
    tick100.classList.remove("active");
  } else {
    tick100.classList.add("active");
  }
}

async function sendGain(sliderPos) {
  const displayPct = sliderToPercent(sliderPos);
  const gain = displayPct / 100;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await browser.tabs.sendMessage(tab.id, { type: "SET_GAIN", gain });
  } catch {
    // Content script not yet injected (e.g. about: pages) — silently ignore.
  }
  await browser.storage.local.set({ [`tab_${tab.id}`]: displayPct });
}

// Whitelist helpers

function isSiteActive(settings, origin) {
  if (!settings || typeof settings !== "object") return true;
  if (settings.mode === "whitelist") {
    const list = Array.isArray(settings.whitelist) ? settings.whitelist : [];
    return list.includes(origin);
  }
  return true;
}

function renderWhitelist(settings, origin) {
  const isWhitelistMode = settings && settings.mode === "whitelist";

  modeToggle.checked = isWhitelistMode;

  if (isWhitelistMode) {
    siteRow.style.display = "flex";
    manageSitesLink.classList.add("visible");

    const truncated = origin.length > 32 ? origin.slice(0, 30) + "…" : origin;
    siteLabel.textContent = truncated;
    siteToggle.checked = isSiteActive(settings, origin);
  } else {
    siteRow.style.display = "none";
    manageSitesLink.classList.remove("visible");
  }

  const siteEnabled = isSiteActive(settings, origin);
  if (isWhitelistMode && !siteEnabled) {
    volumeSection.classList.add("disabled");
  } else {
    volumeSection.classList.remove("disabled");
  }
}

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Determine current origin — hide whitelist section for non-http(s) pages.
  let currentOrigin = null;
  try {
    currentOrigin = new URL(tab.url).origin;
    if (!currentOrigin.startsWith("http://") && !currentOrigin.startsWith("https://")) {
      currentOrigin = null;
    }
  } catch {
    currentOrigin = null;
  }

  if (currentOrigin === null) {
    whitelistSection.style.display = "none";
  }

  // Load settings and render whitelist UI.
  const storedSettings = await browser.storage.local.get("settings");
  let settings = storedSettings.settings || { mode: "always-on", whitelist: [] };

  if (currentOrigin !== null) {
    renderWhitelist(settings, currentOrigin);
  }

  // --- Whitelist mode toggle ---
  modeToggle.addEventListener("change", async () => {
    const storedNow = await browser.storage.local.get("settings");
    settings = storedNow.settings || { mode: "always-on", whitelist: [] };
    settings.mode = modeToggle.checked ? "whitelist" : "always-on";
    await browser.storage.local.set({ settings });
    if (currentOrigin !== null) renderWhitelist(settings, currentOrigin);
  });

  // --- Site toggle ---
  siteToggle.addEventListener("change", async () => {
    const storedNow = await browser.storage.local.get("settings");
    settings = storedNow.settings || { mode: "always-on", whitelist: [] };
    if (!Array.isArray(settings.whitelist)) settings.whitelist = [];

    if (siteToggle.checked) {
      if (!settings.whitelist.includes(currentOrigin)) {
        settings.whitelist.push(currentOrigin);
      }
    } else {
      settings.whitelist = settings.whitelist.filter((o) => o !== currentOrigin);
    }

    await browser.storage.local.set({ settings });
    renderWhitelist(settings, currentOrigin);
  });

  // --- Manage sites link ---
  manageSitesLink.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  // --- Existing gain init ---
  const stored = await browser.storage.local.get(`tab_${tab.id}`);
  const savedPct = stored[`tab_${tab.id}`];

  if (savedPct !== undefined) {
    const pos = percentToSlider(savedPct);
    slider.value = pos;
    updateUI(pos);
  } else {
    try {
      const resp = await browser.tabs.sendMessage(tab.id, { type: "GET_GAIN" });
      if (resp && resp.gain !== undefined) {
        const pct = Math.round(resp.gain * 100);
        const pos = percentToSlider(pct);
        slider.value = pos;
        updateUI(pos);
      }
    } catch {
      // Default — stays at 100.
    }
  }
}

slider.addEventListener("input", () => {
  const pos = parseInt(slider.value, 10);
  updateUI(pos);
  sendGain(pos);
});

resetBtn.addEventListener("click", () => {
  slider.value = 100; // slider pos 100 → 100%
  updateUI(100);
  sendGain(100);
});

init();
