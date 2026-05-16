const siteList = document.getElementById("siteList");
const emptyState = document.getElementById("emptyState");

async function loadSettings() {
  const result = await browser.storage.local.get("settings");
  return result.settings || { mode: "always-on", whitelist: [] };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ settings });
}

function render(settings) {
  const whitelist = Array.isArray(settings.whitelist) ? settings.whitelist : [];

  siteList.innerHTML = "";

  if (whitelist.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  for (const origin of whitelist) {
    const li = document.createElement("li");

    const originSpan = document.createElement("span");
    originSpan.className = "site-origin";
    originSpan.textContent = origin;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      const current = await loadSettings();
      if (!Array.isArray(current.whitelist)) current.whitelist = [];
      current.whitelist = current.whitelist.filter((o) => o !== origin);
      await saveSettings(current);
      render(current);
    });

    li.appendChild(originSpan);
    li.appendChild(removeBtn);
    siteList.appendChild(li);
  }
}

async function init() {
  const settings = await loadSettings();
  render(settings);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "settings" in changes) {
    const newSettings = changes.settings.newValue || { mode: "always-on", whitelist: [] };
    render(newSettings);
  }
});

init();
