/**
 * Uofthacks13 (MVP) - Manifest V3 service worker background.
 *
 * IMPORTANT: Socket.io client must be bundled locally (MV3 can't load remote scripts).
 * Place your file at: extension/lib/socket.io-client.min.js
 *
 * We load it via importScripts(), which exposes global `io`.
 */

// eslint-disable-next-line no-undef
importScripts(chrome.runtime.getURL("lib/socket.io-client.min.js"));
// eslint-disable-next-line no-undef
importScripts(chrome.runtime.getURL("config.js"));

// eslint-disable-next-line no-undef
const SERVER_URL = CONFIG.SERVER_URL;

const BANNED_SUBSTRINGS = [
  "chrome://",
  "chrome-extension://",
  "localhost",
  "127.0.0.1",
  "accounts.google.com",
];

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function isBannedUrl(url) {
  if (typeof url !== "string") return true;
  const lower = url.toLowerCase();

  // Extra explicit blocks.
  if (lower.startsWith("file://")) return true;

  return BANNED_SUBSTRINGS.some((s) => lower.includes(s));
}

function isValidPlayableUrl(url) {
  return isHttpUrl(url) && !isBannedUrl(url);
}

async function getEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  return Boolean(enabled);
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled: Boolean(enabled) });
}

let socket = null;
let connected = false;
let lastSentUrl = null;

function ensureSocket() {
  if (socket) return socket;

  // socket.io client is a global created by importScripts() above.
  // eslint-disable-next-line no-undef
  socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    connected = true;
    console.log("[socket] connected", socket.id);
    // Send current tab URL on connect (best-effort).
    sendCurrentActiveTabUrl();
  });

  socket.on("disconnect", (reason) => {
    connected = false;
    console.log("[socket] disconnected", reason);
  });

  socket.on("connect_error", (err) => {
    connected = false;
    console.log("[socket] connect_error", err?.message || err);
  });

  socket.on("force_swap", async (payload) => {
    const url = typeof payload === "string" ? payload : payload?.url;

    if (!isValidPlayableUrl(url)) {
      console.log("[force_swap] ignored banned/invalid url:", url);
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.update(tab.id, { url });
  });

  return socket;
}

async function connectIfEnabled() {
  const enabled = await getEnabled();
  if (!enabled) return;
  const s = ensureSocket();
  if (!s.connected) s.connect();
}

async function disconnectIfAny() {
  if (!socket) return;
  try {
    socket.disconnect();
  } catch {
    // ignore
  }
}

async function maybeEmitUrl(url) {
  const enabled = await getEnabled();
  if (!enabled) return;
  if (!socket || !socket.connected) return;

  if (!isValidPlayableUrl(url)) return;
  if (url === lastSentUrl) return;

  lastSentUrl = url;
  socket.emit("update_url", { url });
}

async function sendCurrentActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (typeof url === "string") await maybeEmitUrl(url);
}

// Track tab switches.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const enabled = await getEnabled();
  if (!enabled) return;
  if (!socket || !socket.connected) return;

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (typeof tab?.url === "string") await maybeEmitUrl(tab.url);
  } catch {
    // ignore
  }
});

// Track URL changes (navigation).
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  const enabled = await getEnabled();
  if (!enabled) return;
  if (!socket || !socket.connected) return;

  const url = changeInfo?.url || tab?.url;
  if (typeof url === "string") await maybeEmitUrl(url);
});

// Popup <-> background message bridge.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "get_status") {
      sendResponse({
        enabled: await getEnabled(),
        connected,
        socketId: socket?.id || null,
      });
      return;
    }

    if (msg?.type === "set_enabled") {
      const enabled = Boolean(msg?.enabled);
      await setEnabled(enabled);
      if (enabled) await connectIfEnabled();
      else await disconnectIfAny();

      sendResponse({
        enabled: await getEnabled(),
        connected,
        socketId: socket?.id || null,
      });
      return;
    }

    sendResponse({ ok: false, error: "unknown_message" });
  })();

  // Keep the message channel open for async sendResponse.
  return true;
});

// On service worker startup, connect if enabled.
connectIfEnabled();

