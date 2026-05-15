# Volume Boost

A Firefox extension that amplifies the audio volume of the current tab up to 400%.

Works in Firefox 109+ and Zen Browser.

## Features

- Boost volume up to **400%** using a quadratic slider (fine control near 100%, wide range at the top)
- Per-tab volume — each tab remembers its own setting
- Toolbar badge shows the active boost level at a glance
- Reset button snaps back to 100% in one click
- Keyboard shortcut: **Alt+Shift+V** opens the popup

## Installation

### Option A — Download the signed XPI (easiest)

1. Go to [Releases](../../releases) and download the latest `.xpi` file
2. In Firefox or Zen, open `about:addons` → gear icon → **Install Add-on From File**
3. Select the `.xpi` — the extension installs permanently and survives restarts

### Option B — Load temporarily (no signing, dev/testing)

The extension works fully but is removed when the browser closes.

1. Open `about:debugging` → **This Firefox**
2. Click **Load Temporary Add-on...**
3. Select `manifest.json` from this folder

### Option C — Sign and install permanently yourself

If you want to build and sign the extension using your own AMO credentials:

**One-time setup**

1. Create a free account at https://addons.mozilla.org
2. Generate an API key and secret at `https://addons.mozilla.org/developers/addon/api/key/`
3. Install `web-ext`:
   ```
   npm install -g web-ext
   ```
4. Create a `.env` file in the project root:
   ```
   AMO_API_KEY=user:12345678:99
   AMO_API_SECRET=abcdef1234567890...
   ```

**Sign and install**

```bash
./sign.sh
```

This bumps the patch version in `manifest.json`, packages, and signs the extension via Mozilla's unlisted channel — no public listing, no review queue. The signed `.xpi` lands in `web-ext-artifacts/`. Install it via `about:addons` → gear icon → **Install Add-on From File**, or drag it onto a browser window.

Re-run `./sign.sh` and reinstall after any code change.

## Browser compatibility

Firefox 109+ and any Firefox-based browser (Zen, Floorp, etc.) that supports Manifest V2 and the `browser.*` WebExtension API.

Not compatible with Chrome — Chrome requires Manifest V3 and uses a different API surface.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the active tab's ID to send gain messages |
| `tabs` | Query the current tab and listen for tab-switch events (to update the badge) |
| `storage` | Remember the volume setting per tab across popup open/close |
