const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Auto-updater
  checkForUpdates:  () => ipcRenderer.invoke("check-for-updates"),
  installUpdate:    () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable:       (cb) => ipcRenderer.on("update-available",        (_e, data) => cb(data)),
  onUpdateDownloadProgress:(cb) => ipcRenderer.on("update-download-progress", (_e, data) => cb(data)),
  onUpdateDownloaded:      (cb) => ipcRenderer.on("update-downloaded",        (_e, data) => cb(data)),
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners("update-available");
    ipcRenderer.removeAllListeners("update-download-progress");
    ipcRenderer.removeAllListeners("update-downloaded");
  },
});
