const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tv", {
  init: () => ipcRenderer.invoke("init"),
  set: (patch) => ipcRenderer.invoke("set", patch),
  cycleCorner: () => ipcRenderer.invoke("cycle-corner"),
  quit: () => ipcRenderer.invoke("quit"),
  onFocus: (fn) => ipcRenderer.on("focus", (_e, focused) => fn(focused)),
  onState: (fn) => ipcRenderer.on("state", (_e, state) => fn(state)),
  onMedia: (fn) => ipcRenderer.on("media", (_e, cmd) => fn(cmd)),
  onStashed: (fn) => ipcRenderer.on("stashed", (_e, stashed) => fn(stashed)),
  onTheme: (fn) => ipcRenderer.on("theme", (_e, colors) => fn(colors)),
});
