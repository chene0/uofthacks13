function setStatusText(el, enabled, connected) {
  el.textContent = `Status: ${enabled ? (connected ? "Connected" : "Disconnected") : "Disconnected"}`;
}

async function sendMessage(msg) {
  return await chrome.runtime.sendMessage(msg);
}

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("toggle");
  const status = document.getElementById("status");
  if (!(toggle instanceof HTMLInputElement) || !(status instanceof HTMLElement)) return;

  const initial = await sendMessage({ type: "get_status" });
  toggle.checked = Boolean(initial?.enabled);
  setStatusText(status, Boolean(initial?.enabled), Boolean(initial?.connected));

  toggle.addEventListener("change", async () => {
    const res = await sendMessage({ type: "set_enabled", enabled: toggle.checked });
    setStatusText(status, Boolean(res?.enabled), Boolean(res?.connected));
  });
});

