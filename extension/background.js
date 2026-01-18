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
let punishmentTabId = null; // Tab to close after punishment

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
    const shameName = name || "Unknown Slacker";
    const shameUrl = url || "Unknown Site";

    // ALWAYS open a new tab with the perpetrator's slacking URL and show shame card there
    if (!url || !isHttpUrl(url)) {
      console.log("[receive_shame] Invalid URL, cannot open tab");
      return;
    }

    const newTab = await chrome.tabs.create({ url, active: true });
    console.log("[receive_shame] Opened new tab:", newTab.id);

    // Wait for new tab to finish loading, then inject shame card
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === newTab.id && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);

        // Try content script first (if available)
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(newTab.id, {
              type: "display_shame",
              name: shameName,
              url: shameUrl,
              photo: photo || null,
            });
            console.log("[receive_shame] Sent shame to content script on new tab");
          } catch (err) {
            // Content script not available, inject directly
            console.log("[receive_shame] Content script not available, injecting directly");
            try {
              await chrome.scripting.executeScript({
                target: { tabId: newTab.id },
                func: showShameCardInjected,
                args: [shameName, shameUrl, photo || null],
              });
              console.log("[receive_shame] Injected shame card on new tab");
            } catch (injectErr) {
              console.log("[receive_shame] Failed to inject:", injectErr.message);
            }
          }
        }, 1000); // Longer delay to ensure page is fully ready
      }
    });
  });

  // Injected function for fallback shame display
  function showShameCardInjected(name, url, photo) {
    // Remove any existing shame card
    const existing = document.getElementById("caught4k-shame");
    if (existing) existing.remove();

    let domain = url;
    try { domain = new URL(url).hostname; } catch { }

    const card = document.createElement("div");
    card.id = "caught4k-shame";
    card.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 999999;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 4px solid #e94560;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 0 60px rgba(233, 69, 96, 0.5);
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 400px;
    `;

    card.innerHTML = `
      <div style="color: #e94560; font-size: 28px; font-weight: bold; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 2px;">
        CAUGHT 4K
      </div>
      <div style="margin-bottom: 16px;">
        ${photo ? `<img src="${photo}" style="width: 200px; height: 150px; object-fit: cover; border-radius: 8px; border: 2px solid #e94560;">` : ''}
      </div>
      <div style="color: #fff; font-size: 18px; margin-bottom: 8px;">
        <strong style="color: #e94560;">${name}</strong>
      </div>
      <div style="color: #aaa; font-size: 14px; margin-bottom: 16px;">
        was slacking on <strong style="color: #0f4c75;">${domain}</strong>
      </div>
      <button id="caught4k-close" style="
        background: #e94560;
        color: white;
        border: none;
        padding: 12px 32px;
        font-size: 16px;
        font-weight: bold;
        border-radius: 8px;
        cursor: pointer;
      ">DISMISS</button>
    `;

    document.body.appendChild(card);
    document.getElementById("caught4k-close").addEventListener("click", () => card.remove());
    setTimeout(() => { if (document.getElementById("caught4k-shame")) card.remove(); }, 10000);
  }

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

  // Don't charge if camera permission not granted
  const hasPermission = await hasCameraPermission();
  if (!hasPermission) return;

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
  // Save the tab ID so we can close it after punishment
  punishmentTabId = tabId;

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

  // Close the slacking tab after punishment
  if (punishmentTabId) {
    chrome.tabs.remove(punishmentTabId).catch(() => {
      console.log("[shame] Could not close tab");
    });
    console.log("[shame] Closed slacking tab:", punishmentTabId);
    punishmentTabId = null;
  }

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
      const wantsEnabled = Boolean(msg?.enabled);

      // If trying to enable, check camera permission first
      if (wantsEnabled) {
        const hasPermission = await hasCameraPermission();
        if (!hasPermission) {
          // Don't enable, open welcome page instead
          openWelcomePage();
          sendResponse({
            enabled: false,
            connected,
            chargeLevel,
            socketId: socket?.id || null,
            needsCameraPermission: true,
          });
          return;
        }
      }

      await setEnabled(wantsEnabled);
      if (wantsEnabled) await connectIfEnabled();
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

// Check camera permission on every startup (not just install)
(async function checkCameraOnStartup() {
  const hasPermission = await hasCameraPermission();
  console.log("[init] Camera permission status:", hasPermission);
  if (!hasPermission) {
    console.log("[init] Camera permission not granted, opening welcome page");
    openWelcomePage();
  }
})();

// Check if camera permission has been granted
async function hasCameraPermission() {
  const { cameraPermissionGranted } = await chrome.storage.local.get({ cameraPermissionGranted: false });
  return Boolean(cameraPermissionGranted);
}

// Open welcome page to request camera permission
function openWelcomePage() {
  chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
}

// On install, open the welcome page to request camera permission
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[init] Extension installed/updated:", details.reason);
  fetchUserIdentity();

  // Always open welcome page on fresh install
  if (details.reason === "install") {
    openWelcomePage();
  } else {
    // On update, check if permission already granted
    const hasPermission = await hasCameraPermission();
    if (!hasPermission) {
      openWelcomePage();
    }
  }
});
