const slider = document.getElementById("volumeSlider");
const valueDisplay = document.getElementById("volumeValue");
const resetBtn = document.getElementById("resetBtn");
const tick100 = document.getElementById("tick100");

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

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

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
