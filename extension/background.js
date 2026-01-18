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
let currentUserIdentity = { email: "Anonymous Slacker", name: "Anonymous Slacker" };
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
    // #region agent log
    console.log("[identity] DEBUG: Starting identity fetch");
    // #endregion

    // Try getProfileUserInfo first (may not work in MV3 service workers)
    let email = null;
    try {
      const userInfo = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" });
      // #region agent log
      console.log("[identity] DEBUG: getProfileUserInfo result =", JSON.stringify(userInfo));
      // #endregion
      email = userInfo?.email;
    } catch (err) {
      // #region agent log
      console.log("[identity] DEBUG: getProfileUserInfo failed:", err.message);
      // #endregion
    }

    // If getProfileUserInfo didn't work, try OAuth approach
    if (!email) {
      // #region agent log
      console.log("[identity] DEBUG: Trying OAuth token approach");
      // #endregion
      try {
        // Try interactive first (will prompt user if needed)
        // #region agent log
        console.log("[identity] DEBUG: Calling getAuthToken with scopes:", ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]);
        // #endregion

        let token;
        try {
          token = await chrome.identity.getAuthToken({
            interactive: true,
            scopes: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
          });
        } catch (tokenErr) {
          // #region agent log
          console.log("[identity] DEBUG: getAuthToken threw error:", tokenErr.message, tokenErr);
          // #endregion
          throw tokenErr;
        }

        // #region agent log
        console.log("[identity] DEBUG: getAuthToken returned:", typeof token, token);
        if (token) {
          if (typeof token === "string") {
            console.log("[identity] DEBUG: Token is string, length =", token.length);
          } else if (typeof token === "object") {
            console.log("[identity] DEBUG: Token is object, keys =", Object.keys(token));
          }
        }
        // #endregion

        // Extract token string from object if needed
        let tokenString = null;
        if (typeof token === "string") {
          tokenString = token;
        } else if (token && typeof token === "object") {
          // Sometimes getAuthToken returns an object with the token inside
          tokenString = token.token || token.access_token || token.value || (typeof token.toString === "function" ? token.toString() : null);
          // #region agent log
          console.log("[identity] DEBUG: Extracted token string from object:", tokenString ? "YES" : "NO");
          // #endregion
        }

        if (tokenString && typeof tokenString === "string") {

          // Try People API first (better for getting full name)
          try {
            // #region agent log
            console.log("[identity] DEBUG: Trying People API");
            // #endregion
            const peopleResponse = await fetch(
              "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses",
              {
                headers: { Authorization: `Bearer ${tokenString}` },
              }
            );

            // #region agent log
            console.log("[identity] DEBUG: People API status =", peopleResponse.status);
            // #endregion

            if (peopleResponse.ok) {
              const peopleData = await peopleResponse.json();
              // #region agent log
              console.log("[identity] DEBUG: People API response =", JSON.stringify(peopleData));
              // #endregion

              // Extract email
              const emailAddresses = peopleData?.emailAddresses;
              if (emailAddresses && emailAddresses.length > 0) {
                email = emailAddresses.find((e) => e.metadata?.primary)?.value || emailAddresses[0]?.value;
              }

              // Extract name
              const names = peopleData?.names;
              if (names && names.length > 0) {
                const primaryName = names.find((n) => n.metadata?.primary) || names[0];
                if (primaryName?.givenName && primaryName?.familyName) {
                  const fullName = `${primaryName.givenName} ${primaryName.familyName}`;
                  currentUserIdentity = { email: email || "Anonymous Slacker", name: fullName };
                  console.log("[identity] User:", fullName, `(${email})`);
                  return;
                } else if (primaryName?.displayName) {
                  currentUserIdentity = { email: email || "Anonymous Slacker", name: primaryName.displayName };
                  console.log("[identity] User:", primaryName.displayName, `(${email})`);
                  return;
                }
              }
            } else {
              const errorText = await peopleResponse.text();
              // #region agent log
              console.log("[identity] DEBUG: People API error =", errorText);
              // #endregion
            }
          } catch (peopleErr) {
            // #region agent log
            console.log("[identity] DEBUG: People API exception =", peopleErr.message);
            // #endregion
          }

          // Fallback to userinfo API
          // #region agent log
          console.log("[identity] DEBUG: Trying userinfo API as fallback");
          // #endregion
          const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokenString}` },
          });

          if (response.ok) {
            const userData = await response.json();
            // #region agent log
            console.log("[identity] DEBUG: userinfo API response =", JSON.stringify(userData));
            // #endregion
            email = userData?.email || email;
            // If we got name from userinfo, use it
            if (userData?.name) {
              currentUserIdentity = { email: email || "Anonymous Slacker", name: userData.name };
              console.log("[identity] User:", userData.name, `(${email})`);
              return;
            }
          } else {
            const errorText = await response.text();
            // #region agent log
            console.log("[identity] DEBUG: userinfo API failed:", response.status, errorText);
            // #endregion
          }
        } else {
          // #region agent log
          console.log("[identity] DEBUG: Token is missing or invalid, cannot proceed with OAuth");
          // #endregion
        }
      } catch (oauthErr) {
        // #region agent log
        console.log("[identity] DEBUG: OAuth approach failed:", oauthErr.message, oauthErr);
        // #endregion
      }
    }

    if (!email) {
      // Fallback: Generate or retrieve a persistent unique identifier
      // #region agent log
      console.log("[identity] DEBUG: No email found, generating persistent ID");
      // #endregion

      let persistentId = await chrome.storage.local.get("persistentUserId");
      if (!persistentId.persistentUserId) {
        // Generate a random but memorable identifier
        const adjectives = ["Sneaky", "Crafty", "Sly", "Clever", "Wily", "Shady", "Tricky"];
        const nouns = ["Fox", "Raven", "Shadow", "Ghost", "Phantom", "Viper", "Cobra"];
        const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        const randomNum = Math.floor(Math.random() * 1000);
        persistentId.persistentUserId = `${randomAdj} ${randomNoun} ${randomNum}`;
        await chrome.storage.local.set({ persistentUserId: persistentId.persistentUserId });
      }

      currentUserIdentity = {
        email: "Anonymous Slacker",
        name: persistentId.persistentUserId
      };
      console.log("[identity] Using generated ID:", persistentId.persistentUserId);
      // #region agent log
      console.log("[identity] DEBUG: Generated persistent ID =", persistentId.persistentUserId);
      // #endregion
      return;
    }

    // Try to get full name from Google People API
    let fullName = null;
    try {
      // #region agent log
      console.log("[identity] DEBUG: Attempting to get auth token");
      // #endregion

      const token = await chrome.identity.getAuthToken({
        interactive: false,
        scopes: ["https://www.googleapis.com/auth/userinfo.profile"],
      });

      // Extract token string from object if needed
      let tokenString = null;
      if (typeof token === "string") {
        tokenString = token;
      } else if (token && typeof token === "object") {
        tokenString = token.token || token.access_token || token.value || (typeof token.toString === "function" ? token.toString() : null);
      }

      // #region agent log
      console.log("[identity] DEBUG: Token received =", tokenString ? "YES" : "NO", tokenString ? (tokenString.substring(0, 20) + "...") : "NO TOKEN");
      // #endregion

      if (tokenString) {
        // Call Google People API to get profile
        // #region agent log
        console.log("[identity] DEBUG: Calling People API");
        // #endregion

        const response = await fetch(
          "https://people.googleapis.com/v1/people/me?personFields=names",
          {
            headers: {
              Authorization: `Bearer ${tokenString}`,
            },
          }
        );

        // #region agent log
        console.log("[identity] DEBUG: API response status =", response.status, response.statusText);
        // #endregion

        if (response.ok) {
          const data = await response.json();
          // #region agent log
          console.log("[identity] DEBUG: API response data =", JSON.stringify(data));
          // #endregion

          const names = data?.names;
          if (names && names.length > 0) {
            const primaryName = names.find((n) => n.metadata?.primary) || names[0];
            // #region agent log
            console.log("[identity] DEBUG: primaryName =", JSON.stringify(primaryName));
            // #endregion

            if (primaryName?.givenName && primaryName?.familyName) {
              fullName = `${primaryName.givenName} ${primaryName.familyName}`;
            } else if (primaryName?.displayName) {
              fullName = primaryName.displayName;
            }
            // #region agent log
            console.log("[identity] DEBUG: fullName extracted =", fullName);
            // #endregion
          } else {
            // #region agent log
            console.log("[identity] DEBUG: No names array in response");
            // #endregion
          }
        } else {
          const errorText = await response.text();
          // #region agent log
          console.log("[identity] DEBUG: API error response =", errorText);
          // #endregion
        }
      } else {
        // #region agent log
        console.log("[identity] DEBUG: No token received");
        // #endregion
      }
    } catch (apiErr) {
      console.log("[identity] Could not fetch name from Google API:", apiErr);
      // #region agent log
      console.log("[identity] DEBUG: API error details =", apiErr.message, apiErr.stack);
      // #endregion
      // Continue with email fallback
    }

    // Use name if available, otherwise use email, otherwise "Anonymous Slacker"
    if (fullName) {
      currentUserIdentity = { email: userInfo.email, name: fullName };
      console.log("[identity] User:", fullName, `(${userInfo.email})`);
    } else {
      currentUserIdentity = { email: userInfo.email, name: userInfo.email };
      console.log("[identity] User:", userInfo.email);
      // #region agent log
      console.log("[identity] DEBUG: Using email as name, fullName was null");
      // #endregion
    }
  } catch (err) {
    console.log("[identity] Error fetching identity:", err);
    // #region agent log
    console.log("[identity] DEBUG: Outer catch block, error =", err.message, err.stack);
    // #endregion
    currentUserIdentity = { email: "Anonymous Slacker", name: "Anonymous Slacker" };
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
      padding: 30px;
      box-shadow: 0 0 60px rgba(233, 69, 96, 0.5);
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 480px;
    `;

    card.innerHTML = `
      <div style="color: #e94560; font-size: 34px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px;">
        CAUGHT 4K
      </div>
      <div style="margin-bottom: 20px;">
        ${photo ? `<img src="${photo}" style="width: 240px; height: 180px; object-fit: cover; border-radius: 8px; border: 2px solid #e94560;">` : ''}
      </div>
      <div style="color: #fff; font-size: 22px; margin-bottom: 10px;">
        <strong style="color: #e94560;">${name}</strong>
      </div>
      <div style="color: #aaa; font-size: 17px; margin-bottom: 20px;">
        was slacking on <strong style="color: #0f4c75;">${domain}</strong>
      </div>
      <button id="caught4k-close" style="
        background: #e94560;
        color: white;
        border: none;
        padding: 14px 38px;
        font-size: 19px;
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
      name: currentUserIdentity.name,
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
    name: currentUserIdentity.name,
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
