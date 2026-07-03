const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("runway", {
  getStatus: () => ipcRenderer.invoke("status:get"),
  refresh: () => ipcRenderer.invoke("status:refresh"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  openCodexFolder: () => ipcRenderer.invoke("app:openCodexFolder"),
  closePanel: () => ipcRenderer.invoke("app:closePanel"),
  onStatusUpdated: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("status-updated", handler);
    return () => ipcRenderer.removeListener("status-updated", handler);
  },
});
