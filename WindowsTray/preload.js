const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("runway", {
  getStatus: () => ipcRenderer.invoke("status:get"),
  refresh: () => ipcRenderer.invoke("status:refresh"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  testNotification: () => ipcRenderer.invoke("notifications:test"),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  openCodexFolder: () => ipcRenderer.invoke("app:openCodexFolder"),
  openStatusFolder: () => ipcRenderer.invoke("app:openStatusFolder"),
  openGitHub: () => ipcRenderer.invoke("app:openGitHub"),
  openFeedback: () => ipcRenderer.invoke("app:openFeedback"),
  closePanel: () => ipcRenderer.invoke("app:closePanel"),
  onStatusUpdated: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("status-updated", handler);
    return () => ipcRenderer.removeListener("status-updated", handler);
  },
});
