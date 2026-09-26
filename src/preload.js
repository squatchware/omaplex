const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tv", {
  init: () => ipcRenderer.invoke("init"),
  set: (patch) => ipcRenderer.invoke("set", patch),
  cycleCorner: () => ipcRenderer.invoke("cycle-corner"),
  quit: () => ipcRenderer.invoke("quit"),
  onFocus: (fn) => ipcRenderer.on("focus", (_e, focused) => fn(focused)),
  onTheme: (fn) => ipcRenderer.on("theme", (_e, colors) => fn(colors)),
});
