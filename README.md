# Uofthacks13 — Tab Swap Troll (Chrome Extension + Node Backend)

MVP: users connect to a central Socket.io server; every 15 seconds the server randomly pairs active users and swaps their current tab URLs.

## Repo layout
- `server/`: Node.js + Express + Socket.io backend
- `extension/`: Chrome extension (Manifest V3)
  - `lib/socket.io-client.min.js`: **you must provide this file locally**

## Prereqs
- Node.js 18+ (tested with Node 22)
- `pnpm`
- Chrome (or Chromium) with Developer Mode enabled

## Run the backend

```bash
cd server
pnpm install
pnpm dev
```

Server runs at `http://localhost:3000`.

## Set up the extension
1. Put your Socket.io client bundle here:
   - `extension/lib/socket.io-client.min.js`
   - It must define global `io` (the service worker loads it via `importScripts()`).
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** → select the `extension/` folder.

## Use it (demo checklist)
1. Start the backend (above).
2. Open **two separate Chrome profiles** (or two different machines) and load the extension in both.
3. In each profile, open a couple normal websites (http/https).
4. Ensure the extension popup toggle is **Enabled** (status should show Connected if the server is reachable).
5. Wait ~15 seconds:
   - You should see tabs get swapped and an alert: “TAB SWAPPED!”

## Safety filters (MVP)
The extension will **never send or accept** URLs containing:
- `chrome://`
- `chrome-extension://`
- `localhost`
- `127.0.0.1`
- `accounts.google.com`
- `file://`

The server also applies the same filtering as a backstop.
