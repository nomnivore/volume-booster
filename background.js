async function updateBadge(tabId) {
  const key = `tab_${tabId}`;
  const result = await browser.storage.local.get(key);
  const value = result[key];

  if (value !== undefined && value !== 100) {
    await browser.browserAction.setBadgeText({ text: `${value}%`, tabId });
    await browser.browserAction.setBadgeBackgroundColor({
      color: value > 100 ? "#ff9f43" : "#4a9eff",
      tabId,
    });
  } else {
    await browser.browserAction.setBadgeText({ text: "", tabId });
  }
}

browser.tabs.onActivated.addListener(({ tabId }) => {
  updateBadge(tabId).catch(() => {});
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const key of Object.keys(changes)) {
    if (!key.startsWith("tab_")) continue;
    const tabId = parseInt(key.slice(4), 10);
    updateBadge(tabId).catch(() => {});
  }
});
