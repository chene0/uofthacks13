// Request camera permission and store result

const grantBtn = document.getElementById("grantBtn");
const successEl = document.getElementById("success");
const deniedEl = document.getElementById("denied");

async function requestCameraAccess() {
  grantBtn.disabled = true;
  grantBtn.textContent = "REQUESTING...";
  deniedEl.classList.remove("show");

  try {
    // Request camera access
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    
    // Stop the stream immediately (we just needed permission)
    stream.getTracks().forEach(track => track.stop());
    
    // Save permission granted status
    await chrome.storage.local.set({ cameraPermissionGranted: true });
    
    // Show success
    grantBtn.style.display = "none";
    successEl.classList.add("show");
    
    // Auto-close tab after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);
    
  } catch (err) {
    console.log("Camera access denied:", err);
    
    // Save permission denied status
    await chrome.storage.local.set({ cameraPermissionGranted: false });
    
    // Show error
    grantBtn.disabled = false;
    grantBtn.textContent = "TRY AGAIN";
    deniedEl.classList.add("show");
  }
}

grantBtn.addEventListener("click", requestCameraAccess);

// Check if permission was already granted
async function checkExistingPermission() {
  try {
    const result = await navigator.permissions.query({ name: "camera" });
    if (result.state === "granted") {
      await chrome.storage.local.set({ cameraPermissionGranted: true });
      grantBtn.style.display = "none";
      successEl.classList.add("show");
    }
  } catch (err) {
    // permissions.query might not be supported, that's ok
  }
}

checkExistingPermission();
