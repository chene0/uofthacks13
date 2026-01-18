/**
 * Caught 4K - Content Script
 * Handles warning overlays, webcam capture, and shame display.
 */

// Prevent multiple injections
if (window.__caught4kInjected) {
  // Already injected
} else {
  window.__caught4kInjected = true;

  // ============================================================================
  // WARNING OVERLAY - Dark Souls style with screen dim
  // ============================================================================
  function showWarning(text) {
    // Remove any existing warning elements
    const existingBackdrop = document.getElementById("caught4k-warning-backdrop");
    const existingText = document.getElementById("caught4k-warning");
    if (existingBackdrop) existingBackdrop.remove();
    if (existingText) existingText.remove();

    // Create dark backdrop that dims the entire screen
    const backdrop = document.createElement("div");
    backdrop.id = "caught4k-warning-backdrop";
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0);
      z-index: 999998;
      pointer-events: none;
      transition: background 1.5s ease-in-out;
    `;

    // Create warning text overlay
    const overlay = document.createElement("div");
    overlay.id = "caught4k-warning";
    overlay.innerHTML = text;
    overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 999999;
      font-family: 'Times New Roman', serif;
      font-size: 48px;
      font-weight: bold;
      color: #ff0000;
      text-shadow: 
        0 0 10px #000,
        0 0 20px #000,
        0 0 30px #000,
        0 0 40px #ff0000,
        2px 2px 0 #000,
        -2px -2px 0 #000,
        2px -2px 0 #000,
        -2px 2px 0 #000;
      text-align: center;
      pointer-events: none;
      opacity: 0;
      transition: opacity 1.5s ease-in-out;
      text-transform: uppercase;
      letter-spacing: 4px;
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(overlay);

    // Trigger fade-in after a tiny delay (needed for CSS transition)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.style.background = "rgba(0, 0, 0, 0.7)";
        overlay.style.opacity = "1";
      });
    });

    // Fade out after 4 seconds (stays visible longer)
    setTimeout(() => {
      backdrop.style.background = "rgba(0, 0, 0, 0)";
      overlay.style.opacity = "0";
      // Remove elements after fade-out transition completes
      setTimeout(() => {
        backdrop.remove();
        overlay.remove();
      }, 1500);
    }, 4000);
  }

  // ============================================================================
  // WHITE SCREEN EFFECT (stays until photo is captured)
  // ============================================================================
  function showWhiteScreen() {
    // Remove any existing
    const existing = document.getElementById("caught4k-flash");
    if (existing) existing.remove();

    const flash = document.createElement("div");
    flash.id = "caught4k-flash";
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: white;
      z-index: 999999;
      opacity: 1;
      pointer-events: all;
    `;

    document.body.appendChild(flash);
    return flash;
  }

  function hideWhiteScreen() {
    const flash = document.getElementById("caught4k-flash");
    if (flash) {
      flash.style.transition = "opacity 0.3s ease-out";
      flash.style.opacity = "0";
      setTimeout(() => flash.remove(), 300);
    }
  }

  // ============================================================================
  // WEBCAM CAPTURE
  // ============================================================================
  async function captureWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });

      // Create video element
      const video = document.createElement("video");
      video.srcObject = stream;
      video.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
      document.body.appendChild(video);

      await video.play();

      // Wait longer for video to stabilize (screen stays white during this)
      await new Promise(r => setTimeout(r, 1500));

      // Create canvas and capture frame
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);

      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
      video.remove();

      // Convert to base64
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      console.log("[content] Webcam captured!");
      return dataUrl;
    } catch (err) {
      console.log("[content] Webcam error:", err);
      // Return a placeholder "ghost" image (simple data URL)
      return createGhostImage();
    }
  }

  function createGhostImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");

    // Dark background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, 200, 200);

    // Ghost emoji text
    ctx.font = "80px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👻", 100, 90);

    // "Camera Denied" text
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#888";
    ctx.fillText("Camera Denied", 100, 160);

    return canvas.toDataURL("image/png");
  }

  // ============================================================================
  // PUNISHMENT HANDLER
  // ============================================================================
  async function handlePunishment(name, url) {
    console.log("[content] Punishment triggered for:", name);

    // Show white screen (stays until photo is done)
    showWhiteScreen();

    // Capture webcam while screen is white
    const photo = await captureWebcam();

    // Hide the white screen after capture
    hideWhiteScreen();

    // Send back to background
    chrome.runtime.sendMessage({
      type: "punishment_complete",
      photo: photo,
      name: name,
      url: url,
    });
  }

  // ============================================================================
  // SHAME DISPLAY - Mugshot card
  // ============================================================================
  function showShameCard(name, url, photo) {
    // Remove any existing shame card
    const existing = document.getElementById("caught4k-shame");
    if (existing) existing.remove();

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
      animation: caught4k-shake 0.5s ease-in-out;
    `;

    // Extract domain from URL
    let domain = url;
    try {
      domain = new URL(url).hostname;
    } catch { }

    card.innerHTML = `
      <style>
        @keyframes caught4k-shake {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
          25% { transform: translate(-50%, -50%) rotate(-2deg); }
          75% { transform: translate(-50%, -50%) rotate(2deg); }
        }
      </style>
      <div style="color: #e94560; font-size: 34px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px;">
        🚨 CAUGHT IN 4K 🚨
      </div>
      <div style="margin-bottom: 20px;">
        ${photo ? `<img src="${photo}" style="width: 240px; height: 180px; object-fit: cover; border-radius: 8px; border: 2px solid #e94560;">` : ''}
      </div>
      <div style="color: #fff; font-size: 22px; margin-bottom: 10px;">
        <strong style="color: #e94560;">${escapeHtml(name)}</strong>
      </div>
      <div style="color: #aaa; font-size: 17px; margin-bottom: 20px;">
        was slacking on <strong style="color: #0f4c75;">${escapeHtml(domain)}</strong>
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
        transition: background 0.2s;
      ">DISMISS</button>
    `;

    document.body.appendChild(card);

    // Close button
    document.getElementById("caught4k-close").addEventListener("click", () => {
      card.remove();
    });

    // Auto-close after 10 seconds
    setTimeout(() => {
      if (document.getElementById("caught4k-shame")) {
        card.remove();
      }
    }, 10000);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // CHARGE BAR UI
  // ============================================================================
  function updateChargeBar(chargeLevel, isSlacking) {
    console.log("[content] updateChargeBar called:", chargeLevel, isSlacking);
    let container = document.getElementById("caught4k-chargebar");

    // Hide if not slacking or charge is 0
    if (!isSlacking || chargeLevel <= 0) {
      console.log("[content] Hiding charge bar (not slacking or charge=0)");
      if (container) {
        container.style.opacity = "0";
        setTimeout(() => container.remove(), 300);
      }
      return;
    }

    // Create container if it doesn't exist
    if (!container) {
      console.log("[content] Creating charge bar container");
      container = document.createElement("div");
      container.id = "caught4k-chargebar";
      container.innerHTML = `
        <div id="caught4k-chargebar-label">SHAME METER</div>
        <div id="caught4k-chargebar-track">
          <div id="caught4k-chargebar-fill"></div>
        </div>
        <div id="caught4k-chargebar-percent">0%</div>
      `;
      container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999990;
        background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%);
        border: 2px solid #e94560;
        border-radius: 12px;
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 20px rgba(233, 69, 96, 0.3);
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        min-width: 180px;
      `;

      // Style the label
      const style = document.createElement("style");
      style.textContent = `
        #caught4k-chargebar-label {
          color: #e94560;
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 2px;
          margin-bottom: 6px;
          text-align: center;
        }
        #caught4k-chargebar-track {
          width: 100%;
          height: 16px;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 8px;
          overflow: hidden;
          position: relative;
        }
        #caught4k-chargebar-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #ff6b6b, #e94560, #ff0000);
          border-radius: 8px;
          transition: width 0.3s ease-out, background 0.3s;
          box-shadow: 0 0 10px rgba(233, 69, 96, 0.5);
        }
        #caught4k-chargebar-percent {
          color: #fff;
          font-size: 14px;
          font-weight: bold;
          text-align: center;
          margin-top: 6px;
        }
        #caught4k-chargebar-fill.danger {
          background: linear-gradient(90deg, #ff0000, #cc0000, #ff0000);
          animation: caught4k-pulse 0.5s infinite alternate;
        }
        @keyframes caught4k-pulse {
          from { box-shadow: 0 0 10px rgba(255, 0, 0, 0.5); }
          to { box-shadow: 0 0 25px rgba(255, 0, 0, 0.9); }
        }
      `;
      container.appendChild(style);
      document.body.appendChild(container);

      // Fade in
      requestAnimationFrame(() => {
        container.style.opacity = "1";
      });
    }

    // Update the bar
    const fill = document.getElementById("caught4k-chargebar-fill");
    const percent = document.getElementById("caught4k-chargebar-percent");

    if (fill) {
      fill.style.width = `${chargeLevel}%`;
      if (chargeLevel >= 75) {
        fill.classList.add("danger");
      } else {
        fill.classList.remove("danger");
      }
    }

    if (percent) {
      percent.textContent = `${chargeLevel}%`;
      if (chargeLevel >= 90) {
        percent.style.color = "#ff0000";
      } else if (chargeLevel >= 75) {
        percent.style.color = "#ff6b6b";
      } else {
        percent.style.color = "#fff";
      }
    }
  }

  // ============================================================================
  // MESSAGE LISTENER
  // ============================================================================
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "display_warning") {
      showWarning(msg.text);
      sendResponse({ ok: true });
    }

    if (msg?.type === "trigger_punishment") {
      handlePunishment(msg.name, msg.url);
      sendResponse({ ok: true });
    }

    if (msg?.type === "display_shame") {
      showShameCard(msg.name, msg.url, msg.photo);
      sendResponse({ ok: true });
    }

    if (msg?.type === "update_charge") {
      console.log("[content] update_charge received:", msg.chargeLevel, msg.isSlacking);
      updateChargeBar(msg.chargeLevel, msg.isSlacking);
      sendResponse({ ok: true });
    }

    return true;
  });

  console.log("[content] Caught 4K content script loaded");
}
