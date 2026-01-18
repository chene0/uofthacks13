/**
 * Caught 4K - Productivity Shamer
 * 
 * Tracks time on blacklisted sites, charges a penalty meter,
 * captures webcam selfie at 100%, and shames random victims.
 */

// eslint-disable-next-line no-undef
importScripts(chrome.runtime.getURL("lib/socket.io-client.min.js"));
// eslint-disable-next-line no-undef
importScripts(chrome.runtime.getURL("config.js"));

// eslint-disable-next-line no-undef
const SERVER_URL = CONFIG.SERVER_URL;

// ============================================================================
// BLACKLIST - Sites that charge the shame meter
// ============================================================================
const BLACKLIST = [
  "youtube.com",
  "twitch.tv",
  "netflix.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "hulu.com",
  "disneyplus.com",
  "primevideo.com",
  "pinterest.com",
  "9gag.com",
  "tumblr.com",
  "roblox.com",
  "discord.com",
];

// URLs we should never interact with
const BANNED_SUBSTRINGS = [
  "chrome://",
  "chrome-extension://",
  "localhost",
  "127.0.0.1",
  "accounts.google.com",
];

// ============================================================================
// STATE
// ============================================================================
let socket = null;
let connected = false;
let currentUserIdentity = { email: "Anonymous Slacker" };
let chargeLevel = 0;
let lastWarningLevel = 0; // Track which warning we last sent (50, 75, 90)
let currentSlackingUrl = null; // The URL user was on when caught

// Warning thresholds
const WARNING_THRESHOLDS = [50, 75, 90];
const WARNING_MESSAGES = {
  50: "YOU ARE ON THIN ICE",
  75: "STOP SLACKING",
  90: "PUNISHMENT IMMINENT",
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function isBannedUrl(url) {
  if (typeof url !== "string") return true;
  const lower = url.toLowerCase();
  if (lower.startsWith("file://")) return true;
  return BANNED_SUBSTRINGS.some((s) => lower.includes(s));
}

function isBlacklistedUrl(url) {
  if (!isHttpUrl(url)) return false;
  const lower = url.toLowerCase();
  return BLACKLIST.some((domain) => lower.includes(domain));
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ============================================================================
// IDENTITY TRACKING
// ============================================================================
async function fetchUserIdentity() {
  try {
    const userInfo = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" });
    if (userInfo?.email) {
      currentUserIdentity = { email: userInfo.email };
      console.log("[identity] User:", currentUserIdentity.email);
    } else {
      currentUserIdentity = { email: "Anonymous Slacker" };
      console.log("[identity] No email found, using default");
    }
  } catch (err) {
    console.log("[identity] Error fetching identity:", err);
    currentUserIdentity = { email: "Anonymous Slacker" };
  }
}

// ============================================================================
// STORAGE
// ============================================================================
async function getEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  return Boolean(enabled);
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled: Boolean(enabled) });
}

// ============================================================================
// SOCKET CONNECTION
// ============================================================================
function ensureSocket() {
  if (socket) return socket;

  // eslint-disable-next-line no-undef
  socket = io(SERVER_URL, {
    autoConnect: false,
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    connected = true;
    console.log("[socket] connected", socket.id);
  });

  socket.on("disconnect", (reason) => {
    connected = false;
    console.log("[socket] disconnected", reason);
  });

  socket.on("connect_error", (err) => {
    connected = false;
    console.log("[socket] connect_error", err?.message || err);
  });

  // Listen for shame packets from other users
  socket.on("receive_shame", async (payload) => {
    console.log("[receive_shame] Got shamed!", payload);

    const { name, url, photo } = payload;

    // Open a new tab with the perpetrator's slacking URL
    if (url && isHttpUrl(url)) {
      chrome.tabs.create({ url, active: false });
    }

    // Forward to content script to display mugshot card
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "display_shame",
        name: name || "Unknown Slacker",
        url: url || "Unknown Site",
        photo: photo || null,
      }).catch(() => {
        // Content script might not be loaded yet
        console.log("[receive_shame] Could not send to content script");
      });
    }
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

// ============================================================================
// SLACKER CHARGER - The main game loop
// ============================================================================
async function checkAndChargeSlacker() {
  const enabled = await getEnabled();
  if (!enabled) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url;

    if (!url || !isHttpUrl(url) || isBannedUrl(url)) {
      // Hide charge bar if on non-trackable page
      if (tab?.id) sendChargeUpdate(tab.id, chargeLevel, false);
      return;
    }

    const isSlacking = isBlacklistedUrl(url);

    if (isSlacking) {
      // SLACKING DETECTED - Charge the meter!
      // +2 per second = 100% in ~50 seconds (just under a minute)
      chargeLevel = Math.min(100, chargeLevel + 2);
      currentSlackingUrl = url;

      console.log(`[charger] SLACKING on ${extractDomain(url)} - Charge: ${chargeLevel}%`);

      // Check for warning thresholds
      for (const threshold of WARNING_THRESHOLDS) {
        if (chargeLevel >= threshold && lastWarningLevel < threshold) {
          lastWarningLevel = threshold;
          sendWarningToTab(tab.id, WARNING_MESSAGES[threshold]);
        }
      }

      // PUNISHMENT TIME!
      if (chargeLevel >= 100) {
        console.log("[charger] 💀 PUNISHMENT TRIGGERED!");
        triggerPunishment(tab.id);
      }
    }

    // Update the charge bar UI (show if slacking and has charge, hide otherwise)
    sendChargeUpdate(tab.id, chargeLevel, isSlacking && chargeLevel > 0);

    // Note: Charge does NOT decrease when on safe sites (punishment persists)
  } catch (err) {
    console.log("[charger] Error:", err);
  }
}

async function sendChargeUpdate(tabId, level, isSlacking) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "update_charge",
      chargeLevel: level,
      isSlacking: isSlacking,
    });
  } catch {
    // Content script might not be loaded
  }
}

async function sendWarningToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "display_warning",
      text: message,
    });
    console.log("[warning] Sent:", message);
  } catch {
    console.log("[warning] Could not send warning to tab");
  }
}

async function triggerPunishment(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "trigger_punishment",
      name: currentUserIdentity.email,
      url: currentSlackingUrl,
    });
    console.log("[punishment] Triggered webcam capture");
  } catch {
    console.log("[punishment] Could not trigger punishment, sending shame packet anyway");
    // Still send shame packet even if content script fails
    sendShamePacket(null);
  }
}

function sendShamePacket(photo) {
  if (!socket || !socket.connected) {
    console.log("[shame] Not connected, cannot send shame packet");
    return;
  }

  const packet = {
    name: currentUserIdentity.email,
    url: currentSlackingUrl,
    photo: photo || null,
  };

  socket.emit("shame_packet", packet);
  console.log("[shame] Sent shame packet:", packet.name, packet.url);

  // Reset charge after punishment
  chargeLevel = 0;
  lastWarningLevel = 0;
  currentSlackingUrl = null;
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    // Popup status request
    if (msg?.type === "get_status") {
      sendResponse({
        enabled: await getEnabled(),
        connected,
        chargeLevel,
        socketId: socket?.id || null,
      });
      return;
    }

    // Popup enable/disable
    if (msg?.type === "set_enabled") {
      const enabled = Boolean(msg?.enabled);
      await setEnabled(enabled);
      if (enabled) await connectIfEnabled();
      else await disconnectIfAny();

      sendResponse({
        enabled: await getEnabled(),
        connected,
        chargeLevel,
        socketId: socket?.id || null,
      });
      return;
    }

    // Content script finished capturing photo
    if (msg?.type === "punishment_complete") {
      console.log("[punishment] Photo captured, sending shame packet");
      sendShamePacket(msg?.photo);
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "unknown_message" });
  })();

  return true;
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Fetch user identity on startup
fetchUserIdentity();

// Start the slacker charger loop (every 1 second)
setInterval(checkAndChargeSlacker, 1000);

// Connect to server if enabled
connectIfEnabled();

// Also fetch identity when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("[init] Extension installed/updated");
  fetchUserIdentity();
});
