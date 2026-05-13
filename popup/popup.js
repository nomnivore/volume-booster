const slider = document.getElementById("volumeSlider");
const valueDisplay = document.getElementById("volumeValue");
const boostBar = document.getElementById("boostBar");
const resetBtn = document.getElementById("resetBtn");
const tick100 = document.getElementById("tick100");

function updateUI(value) {
  valueDisplay.textContent = value;

  // Bar: 0–100% fills left half (blue), 100–200% fills full bar and shifts to orange.
  const pct = value / 2; // 0–100 maps to 0%–100% of bar
  boostBar.style.width = pct + "%";
  if (value > 100) {
    boostBar.style.background = "#ff9f43";
    tick100.classList.remove("active");
  } else {
    boostBar.style.background = "#4a9eff";
    tick100.classList.add("active");
  }
}

async function sendGain(value) {
  const gain = value / 100;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await browser.tabs.sendMessage(tab.id, { type: "SET_GAIN", gain });
  } catch {
    // Content script not yet injected (e.g. about: pages) — silently ignore.
  }
  // Persist per-tab so the popup shows the right value on re-open.
  await browser.storage.local.set({ [`tab_${tab.id}`]: value });
}

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Try reading the stored value for this tab first.
  const stored = await browser.storage.local.get(`tab_${tab.id}`);
  const savedValue = stored[`tab_${tab.id}`];

  if (savedValue !== undefined) {
    slider.value = savedValue;
    updateUI(savedValue);
  } else {
    // Ask the content script for its current gain (covers the case where the
    // popup was never opened but the script is already running).
    try {
      const resp = await browser.tabs.sendMessage(tab.id, { type: "GET_GAIN" });
      if (resp && resp.gain !== undefined) {
        const value = Math.round(resp.gain * 100);
        slider.value = value;
        updateUI(value);
      }
    } catch {
      // Default — stays at 100.
    }
  }
}

slider.addEventListener("input", () => {
  const value = parseInt(slider.value, 10);
  updateUI(value);
  sendGain(value);
});

resetBtn.addEventListener("click", () => {
  slider.value = 100;
  updateUI(100);
  sendGain(100);
});

init();
