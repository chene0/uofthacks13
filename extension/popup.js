function setStatusText(el, enabled, connected) {
  el.textContent = `Status: ${enabled ? (connected ? "Connected" : "Disconnected") : "Disabled"}`;
}

async function sendMessage(msg) {
  return await chrome.runtime.sendMessage(msg);
}

async function checkCameraPermission() {
  const { cameraPermissionGranted } = await chrome.storage.local.get({ cameraPermissionGranted: false });
  return Boolean(cameraPermissionGranted);
}

function updateCameraUI(hasPermission) {
  const cameraStatus = document.getElementById("camera-status");
  const cameraBtn = document.getElementById("camera-btn");

  if (hasPermission) {
    cameraStatus.textContent = "Camera: Granted ✓";
    cameraStatus.className = "camera-status granted";
    cameraBtn.style.display = "none";
  } else {
    cameraStatus.textContent = "Camera: Not Granted ✗";
    cameraStatus.className = "camera-status denied";
    cameraBtn.style.display = "block";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("toggle");
  const status = document.getElementById("status");
  const cameraBtn = document.getElementById("camera-btn");

  if (!(toggle instanceof HTMLInputElement) || !(status instanceof HTMLElement)) return;

  // Get initial status
  const initial = await sendMessage({ type: "get_status" });
  toggle.checked = Boolean(initial?.enabled);
  setStatusText(status, Boolean(initial?.enabled), Boolean(initial?.connected));

  // Check camera permission
  const hasPermission = await checkCameraPermission();
  updateCameraUI(hasPermission);

  // Toggle handler
  toggle.addEventListener("change", async () => {
    const res = await sendMessage({ type: "set_enabled", enabled: toggle.checked });
    setStatusText(status, Boolean(res?.enabled), Boolean(res?.connected));
  });

  // Camera button handler - opens welcome page
  cameraBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    window.close();
  });
});

// Listen for storage changes (camera permission might be granted in welcome page)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.cameraPermissionGranted) {
    updateCameraUI(changes.cameraPermissionGranted.newValue);
  }
});
