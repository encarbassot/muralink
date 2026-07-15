"use strict";
const electron = require("electron");
const fsApi = {
  homeDir: () => electron.ipcRenderer.invoke("fs:homeDir"),
  listDir: (path) => electron.ipcRenderer.invoke("fs:listDir", path),
  stat: (path) => electron.ipcRenderer.invoke("fs:stat", path),
  readText: (path, maxBytes) => electron.ipcRenderer.invoke("fs:readText", path, maxBytes),
  writeText: (path, content) => electron.ipcRenderer.invoke("fs:writeText", path, content),
  rename: (path, newName) => electron.ipcRenderer.invoke("fs:rename", path, newName),
  move: (src, destDir) => electron.ipcRenderer.invoke("fs:move", src, destDir),
  mkdir: (parent, name) => electron.ipcRenderer.invoke("fs:mkdir", parent, name),
  copy: (src, destDir) => electron.ipcRenderer.invoke("fs:copy", src, destDir),
  trash: (path) => electron.ipcRenderer.invoke("fs:trash", path)
};
const serviceApi = {
  status: () => electron.ipcRenderer.invoke("service:status"),
  start: (port) => electron.ipcRenderer.invoke("service:start", port),
  stop: () => electron.ipcRenderer.invoke("service:stop")
};
const scraperApi = {
  status: () => electron.ipcRenderer.invoke("scraper:status"),
  install: () => electron.ipcRenderer.invoke("scraper:install"),
  onProgress: (cb) => {
    const handler = (_e, line) => cb(line);
    electron.ipcRenderer.on("scraper:progress", handler);
    return () => electron.ipcRenderer.off("scraper:progress", handler);
  }
};
const metadataApi = {
  read: (folderPath) => electron.ipcRenderer.invoke("metadata:read", folderPath),
  write: (folderPath, metadata) => electron.ipcRenderer.invoke("metadata:write", folderPath, metadata),
  updateTitle: (folderPath, title) => electron.ipcRenderer.invoke("metadata:updateTitle", folderPath, title),
  updateGridItem: (folderPath, itemPath, layout) => electron.ipcRenderer.invoke("metadata:updateGridItem", folderPath, itemPath, layout),
  updateItemVisualization: (folderPath, itemPath, type) => electron.ipcRenderer.invoke("metadata:updateItemVisualization", folderPath, itemPath, type)
};
const terminalApi = {
  create: (cwd) => electron.ipcRenderer.invoke("terminal:create", cwd),
  write: (id, data) => {
    void electron.ipcRenderer.invoke("terminal:write", id, data);
  },
  resize: (id, cols, rows) => {
    void electron.ipcRenderer.invoke("terminal:resize", id, cols, rows);
  },
  kill: (id) => {
    void electron.ipcRenderer.invoke("terminal:kill", id);
  },
  onData: (cb) => {
    const handler = (_e, id, data) => cb(id, data);
    electron.ipcRenderer.on("terminal:data", handler);
    return () => electron.ipcRenderer.off("terminal:data", handler);
  },
  onExit: (cb) => {
    const handler = (_e, id, code) => cb(id, code);
    electron.ipcRenderer.on("terminal:exit", handler);
    return () => electron.ipcRenderer.off("terminal:exit", handler);
  }
};
const tunnelApi = {
  login: (email, password) => electron.ipcRenderer.invoke("tunnel:login", email, password),
  isLoggedIn: () => electron.ipcRenderer.invoke("tunnel:isLoggedIn"),
  logout: () => electron.ipcRenderer.invoke("tunnel:logout"),
  createShare: (opts) => electron.ipcRenderer.invoke("tunnel:createShare", opts),
  listShares: () => electron.ipcRenderer.invoke("tunnel:listShares"),
  revokeShare: (id) => electron.ipcRenderer.invoke("tunnel:revokeShare", id),
  getLanIp: () => electron.ipcRenderer.invoke("tunnel:getLanIp"),
  getPublicIp: () => electron.ipcRenderer.invoke("tunnel:getPublicIp")
};
const dialogApi = {
  pickDirectory: () => electron.ipcRenderer.invoke("dialog:pickDirectory")
};
const shellApi = {
  openExternal: (url) => electron.shell.openExternal(url)
};
const orchesterApi = {
  getStatus: () => electron.ipcRenderer.invoke("orchester:status"),
  start: (id) => electron.ipcRenderer.invoke("orchester:start", id),
  stop: (id) => electron.ipcRenderer.invoke("orchester:stop", id),
  restart: (id) => electron.ipcRenderer.invoke("orchester:restart", id),
  configure: (id, opts) => electron.ipcRenderer.invoke("orchester:configure", id, opts),
  addShare: (opts) => electron.ipcRenderer.invoke("orchester:addShare", opts),
  removeShare: (id) => electron.ipcRenderer.invoke("orchester:removeShare", id),
  updateShare: (id, patch) => electron.ipcRenderer.invoke("orchester:updateShare", id, patch),
  onStatusChange: (cb) => {
    const handler = (_e, services) => cb(services);
    electron.ipcRenderer.on("orchester:status-change", handler);
    return () => electron.ipcRenderer.off("orchester:status-change", handler);
  }
};
const presenceApi = {
  getDevices: () => electron.ipcRenderer.invoke("presence:devices"),
  onDevicesChange: (cb) => {
    const handler = (_e, devices) => cb(devices);
    electron.ipcRenderer.on("presence:change", handler);
    return () => electron.ipcRenderer.off("presence:change", handler);
  }
};
electron.contextBridge.exposeInMainWorld("fsApi", fsApi);
electron.contextBridge.exposeInMainWorld("serviceApi", serviceApi);
electron.contextBridge.exposeInMainWorld("scraperApi", scraperApi);
electron.contextBridge.exposeInMainWorld("metadataApi", metadataApi);
electron.contextBridge.exposeInMainWorld("terminalApi", terminalApi);
electron.contextBridge.exposeInMainWorld("tunnelApi", tunnelApi);
electron.contextBridge.exposeInMainWorld("dialogApi", dialogApi);
electron.contextBridge.exposeInMainWorld("shellApi", shellApi);
electron.contextBridge.exposeInMainWorld("orchesterApi", orchesterApi);
electron.contextBridge.exposeInMainWorld("presenceApi", presenceApi);
