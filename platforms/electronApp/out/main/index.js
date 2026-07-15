"use strict";
const node_path = require("node:path");
const electron = require("electron");
const node_os = require("node:os");
const node_fs = require("node:fs");
const node_http = require("node:http");
const promises = require("node:fs/promises");
const express = require("express");
const cors = require("cors");
const node_events = require("node:events");
const node_child_process = require("node:child_process");
const client$1 = require("@elio/orchester/client");
const HOME$2 = node_os.homedir();
const ROOTS = [HOME$2];
const TEXT_CAP = 1e6;
function safe(p) {
  const abs = node_path.resolve(node_path.normalize(p));
  const ok = ROOTS.some((root) => abs === root || abs.startsWith(root + node_path.sep));
  if (!ok) throw new Error(`Path outside allowed roots: ${abs}`);
  return abs;
}
function extOf(name, isDir) {
  if (isDir) return "";
  return node_path.extname(name).slice(1).toLowerCase();
}
function homeDir() {
  return HOME$2;
}
async function listDir(p) {
  const dir = safe(p);
  const dirents = await node_fs.promises.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const d of dirents) {
    if (d.name.startsWith(".")) continue;
    const full = node_path.join(dir, d.name);
    let isDir = d.isDirectory();
    let size = 0;
    let mtimeMs = 0;
    try {
      const st = await node_fs.promises.stat(full);
      isDir = st.isDirectory();
      size = st.size;
      mtimeMs = st.mtimeMs;
    } catch {
    }
    out.push({ name: d.name, path: full, isDir, size, mtimeMs, ext: extOf(d.name, isDir) });
  }
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
  });
  return out;
}
async function stat(p) {
  const abs = safe(p);
  const st = await node_fs.promises.stat(abs);
  const isDir = st.isDirectory();
  return {
    path: abs,
    name: node_path.basename(abs),
    isDir,
    size: st.size,
    mtimeMs: st.mtimeMs,
    ctimeMs: st.ctimeMs,
    ext: extOf(abs, isDir)
  };
}
async function writeText(p, content) {
  const abs = safe(p);
  await node_fs.promises.writeFile(abs, content, "utf8");
}
async function readText(p, maxBytes = TEXT_CAP) {
  const abs = safe(p);
  const handle = await node_fs.promises.open(abs, "r");
  try {
    const cap = Math.max(1, Math.min(maxBytes, TEXT_CAP));
    const buf = Buffer.alloc(cap);
    const { bytesRead } = await handle.read(buf, 0, cap, 0);
    const slice = buf.subarray(0, bytesRead);
    if (slice.includes(0)) return { text: "", truncated: false, isText: false };
    const { size } = await handle.stat();
    return { text: slice.toString("utf8"), truncated: size > bytesRead, isText: true };
  } finally {
    await handle.close();
  }
}
async function rename(p, newName) {
  const abs = safe(p);
  if (!newName || newName.includes("/") || newName.includes(node_path.sep) || newName.includes("\0")) {
    throw new Error(`Invalid name: ${newName}`);
  }
  const dest = safe(node_path.join(node_path.dirname(abs), newName));
  await node_fs.promises.rename(abs, dest);
  return dest;
}
async function move(src, destDir) {
  const from = safe(src);
  const intoDir = safe(destDir);
  const dest = node_path.join(intoDir, node_path.basename(from));
  if (dest === from) return from;
  await node_fs.promises.rename(from, dest);
  return dest;
}
async function mkdir(parent, name) {
  if (!name || name.includes("/") || name.includes(node_path.sep) || name.includes("\0")) {
    throw new Error(`Invalid folder name: ${name}`);
  }
  const dest = safe(node_path.join(safe(parent), name));
  await node_fs.promises.mkdir(dest);
  return dest;
}
async function copy(src, destDir) {
  const from = safe(src);
  const intoDir = safe(destDir);
  let dest = node_path.join(intoDir, node_path.basename(from));
  if (dest === from || await exists(dest)) {
    const ext = node_path.extname(from);
    const stem = node_path.basename(from, ext);
    let n = 1;
    do {
      const suffix = n === 1 ? " copy" : ` copy ${n}`;
      dest = node_path.join(intoDir, `${stem}${suffix}${ext}`);
      n++;
    } while (await exists(dest));
  }
  await node_fs.promises.cp(from, dest, { recursive: true, errorOnExist: true });
  return dest;
}
async function trash(p) {
  const abs = safe(p);
  await electron.shell.trashItem(abs);
}
async function exists(p) {
  try {
    await node_fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}
class PresenceService extends node_events.EventEmitter {
  devices = /* @__PURE__ */ new Map();
  expiry = null;
  TTL_MS = 9e4;
  start() {
    if (this.expiry) return;
    this.expiry = setInterval(() => this.#evict(), 15e3);
    this.expiry.unref();
  }
  stop() {
    if (this.expiry) {
      clearInterval(this.expiry);
      this.expiry = null;
    }
    this.devices.clear();
  }
  hello(id, agent, platform, ip) {
    const existing = this.devices.get(id);
    this.devices.set(id, {
      id,
      agent,
      platform,
      ip,
      connectedAt: existing?.connectedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      lastSeen: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.emit("change", this.list());
  }
  bye(id) {
    if (this.devices.has(id)) {
      this.devices.delete(id);
      this.emit("change", this.list());
    }
  }
  list() {
    return Array.from(this.devices.values());
  }
  #evict() {
    const cutoff = Date.now() - this.TTL_MS;
    let changed = false;
    for (const [id, d] of this.devices) {
      if (new Date(d.lastSeen).getTime() < cutoff) {
        this.devices.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit("change", this.list());
  }
}
const presenceService = new PresenceService();
const HOME$1 = node_os.homedir();
const MIME = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  xml: "application/xml",
  zip: "application/zip",
  gz: "application/gzip"
};
function safePath$1(p) {
  try {
    const abs = node_path.resolve(node_path.normalize(p));
    const ok = abs === HOME$1 || abs.startsWith(HOME$1 + node_path.sep);
    return ok ? abs : null;
  } catch {
    return null;
  }
}
function mimeFor(filePath) {
  const ext = node_path.extname(filePath).slice(1).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}
let httpServer = null;
let activePort = null;
function getLanAddress() {
  const nets = node_os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const n of iface) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return null;
}
async function startServer(port = 3131) {
  if (httpServer) return getStatus();
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });
  app.get("/api/modules", (_req, res) => {
    res.json({ modules: [] });
  });
  app.post("/api/__presence/hello", (req, res) => {
    const { id, agent = "", platform = "" } = req.body;
    if (!id) {
      res.status(400).json({ error: "missing id" });
      return;
    }
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
    presenceService.hello(id, agent, platform, ip);
    res.json({ ok: true });
  });
  app.post("/api/__presence/bye", (req, res) => {
    const { id } = req.body;
    if (id) presenceService.bye(id);
    res.json({ ok: true });
  });
  app.get("/api/__presence/devices", (_req, res) => {
    res.json({ devices: presenceService.list() });
  });
  app.get("/api/files/list", async (req, res) => {
    const raw = typeof req.query["path"] === "string" ? req.query["path"] : HOME$1;
    const dir = safePath$1(raw);
    if (!dir) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const dirents = await promises.readdir(dir, { withFileTypes: true });
      const entries = await Promise.all(
        dirents.filter((d) => !d.name.startsWith(".")).map(async (d) => {
          const full = `${dir}${node_path.sep}${d.name}`;
          try {
            const st = await promises.stat(full);
            return {
              name: d.name,
              path: full,
              isDir: st.isDirectory(),
              size: st.size,
              mtimeMs: st.mtimeMs,
              ext: st.isDirectory() ? "" : node_path.extname(d.name).slice(1).toLowerCase()
            };
          } catch {
            return { name: d.name, path: full, isDir: d.isDirectory(), size: 0, mtimeMs: 0, ext: "" };
          }
        })
      );
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
      });
      res.json({ path: dir, entries });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
  app.get("/api/files/serve", (req, res) => {
    const raw = typeof req.query["path"] === "string" ? req.query["path"] : null;
    if (!raw) {
      res.status(400).json({ error: "missing path" });
      return;
    }
    const abs = safePath$1(raw);
    if (!abs) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    let st;
    try {
      st = node_fs.statSync(abs);
    } catch {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (st.isDirectory()) {
      res.status(400).json({ error: "is a directory" });
      return;
    }
    const mime = mimeFor(abs);
    const total = st.size;
    const rangeHeader = req.headers["range"];
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr ?? "0", 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${node_path.basename(abs)}"`
      });
      node_fs.createReadStream(abs, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": total,
        "Content-Type": mime,
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${node_path.basename(abs)}"`
      });
      node_fs.createReadStream(abs).pipe(res);
    }
  });
  return new Promise((resolvePromise, reject) => {
    httpServer = node_http.createServer(app);
    httpServer.listen(port, "0.0.0.0", () => {
      activePort = port;
      presenceService.start();
      resolvePromise(getStatus());
    });
    httpServer.on("error", (err) => {
      httpServer = null;
      reject(err);
    });
  });
}
function stopServer() {
  return new Promise((resolvePromise, reject) => {
    if (!httpServer) {
      resolvePromise();
      return;
    }
    httpServer.close((err) => {
      httpServer = null;
      activePort = null;
      presenceService.stop();
      if (err) reject(err);
      else resolvePromise();
    });
  });
}
function getStatus() {
  const lan = activePort ? getLanAddress() : null;
  return {
    running: httpServer !== null,
    port: activePort,
    lanUrl: lan && activePort ? `http://${lan}:${activePort}` : null
  };
}
let _status = "not-installed";
let _error = null;
function playwrightDir() {
  return node_path.join(electron.app.getPath("userData"), "playwright");
}
function chromiumMarker() {
  return node_path.join(playwrightDir(), ".local-chromium");
}
function getScraperStatus() {
  if (_status === "not-installed" || _status === "error") {
    if (node_fs.existsSync(chromiumMarker())) _status = "ready";
  }
  return { status: _status, error: _error };
}
function installScraper(onProgress) {
  if (_status === "installing") return Promise.reject(new Error("already installing"));
  _status = "installing";
  _error = null;
  return new Promise((resolve, reject) => {
    const playwrightBin = node_path.join(
      electron.app.getAppPath(),
      "..",
      "..",
      "node_modules",
      ".bin",
      "playwright"
    );
    const proc = node_child_process.execFile(
      process.execPath,
      // node binary bundled with Electron
      [playwrightBin, "install", "chromium"],
      {
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: playwrightDir()
        },
        maxBuffer: 10 * 1024 * 1024
      }
    );
    proc.stdout?.on("data", (d) => onProgress(d.toString()));
    proc.stderr?.on("data", (d) => onProgress(d.toString()));
    proc.on("close", (code) => {
      if (code === 0) {
        _status = "ready";
        resolve();
      } else {
        _status = "error";
        _error = `playwright install exited with code ${code}`;
        reject(new Error(_error));
      }
    });
    proc.on("error", (err) => {
      _status = "error";
      _error = err.message;
      reject(err);
    });
  });
}
const METADATA_FILENAME = ".elio";
const DEFAULT_METADATA = {
  version: "1.0"
};
const HOME = node_os.homedir();
function safePath(p) {
  try {
    const abs = node_path.resolve(node_path.normalize(p));
    const ok = abs === HOME || abs.startsWith(HOME + node_path.sep);
    return ok ? abs : null;
  } catch {
    return null;
  }
}
async function readMetadata(folderPath) {
  const safe2 = safePath(folderPath);
  if (!safe2) return null;
  const metaFile = node_path.join(safe2, METADATA_FILENAME);
  if (!node_fs.existsSync(metaFile)) return null;
  try {
    const content = await promises.readFile(metaFile, "utf-8");
    const parsed = JSON.parse(content);
    return parsed;
  } catch {
    return null;
  }
}
async function writeMetadata(folderPath, metadata) {
  const safe2 = safePath(folderPath);
  if (!safe2) throw new Error("unsafe path");
  const metaFile = node_path.join(safe2, METADATA_FILENAME);
  const content = JSON.stringify(metadata, null, 2);
  await promises.writeFile(metaFile, content, "utf-8");
}
async function updateFolderTitle(folderPath, title) {
  const meta = await readMetadata(folderPath) || DEFAULT_METADATA;
  meta.folderTitle = title;
  await writeMetadata(folderPath, meta);
}
async function updateGridItem(folderPath, itemPath, layout) {
  const meta = await readMetadata(folderPath) || DEFAULT_METADATA;
  if (!meta.gridLayout) meta.gridLayout = {};
  meta.gridLayout[itemPath] = layout;
  await writeMetadata(folderPath, meta);
}
async function updateItemVisualization(folderPath, itemPath, type) {
  const meta = await readMetadata(folderPath) || DEFAULT_METADATA;
  if (!meta.itemVisualizations) meta.itemVisualizations = {};
  meta.itemVisualizations[itemPath] = { type };
  await writeMetadata(folderPath, meta);
}
let ptyModule = null;
function getPty() {
  if (!ptyModule) ptyModule = require(["node", "pty"].join("-"));
  return ptyModule;
}
const terminals = /* @__PURE__ */ new Map();
let nextId = 0;
function createTerminal(win, cwd) {
  const pty = getPty();
  const id = `term-${++nextId}`;
  const shell = process.env.SHELL || "/bin/zsh";
  const proc = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cwd || node_os.homedir(),
    env: process.env
  });
  proc.onData((data) => {
    if (!win.isDestroyed()) {
      win.webContents.send("terminal:data", id, data);
    }
  });
  proc.onExit(({ exitCode }) => {
    terminals.delete(id);
    if (!win.isDestroyed()) {
      win.webContents.send("terminal:exit", id, exitCode);
    }
  });
  terminals.set(id, { proc, winId: win.id });
  return id;
}
function writeTerminal(id, data) {
  terminals.get(id)?.proc.write(data);
}
function resizeTerminal(id, cols, rows) {
  terminals.get(id)?.proc.resize(cols, rows);
}
function killTerminal(id) {
  const t = terminals.get(id);
  if (t) {
    t.proc.kill();
    terminals.delete(id);
  }
}
function killAllTerminals() {
  for (const [id, t] of terminals) {
    t.proc.kill();
    terminals.delete(id);
  }
}
const TUNNEL_BASE = process.env["TUNNEL_URL"] ?? "http://localhost:4000";
function tokenPath() {
  const dir = node_path.join(electron.app.getPath("userData"), "tunnel");
  node_fs.mkdirSync(dir, { recursive: true });
  return node_path.join(dir, "session.json");
}
function loadToken() {
  try {
    const raw = node_fs.readFileSync(tokenPath(), "utf8");
    const data = JSON.parse(raw);
    return data.token ?? null;
  } catch {
    return null;
  }
}
function saveToken(token) {
  node_fs.writeFileSync(tokenPath(), JSON.stringify({ token }), "utf8");
}
function clearToken() {
  try {
    node_fs.writeFileSync(tokenPath(), "{}", "utf8");
  } catch {
  }
}
async function authedFetch(path, init = {}) {
  const token = loadToken();
  if (!token) throw new Error("not-logged-in");
  return fetch(`${TUNNEL_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers ?? {}
    }
  });
}
const tunnelClient = {
  async login(email, password) {
    const res = await fetch(`${TUNNEL_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Login failed");
    }
    const data = await res.json();
    saveToken(data.token);
    return data;
  },
  isLoggedIn() {
    return loadToken() !== null;
  },
  logout() {
    clearToken();
  },
  async createShare(opts) {
    const res = await authedFetch("/shares", {
      method: "POST",
      body: JSON.stringify(opts)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Failed to create share");
    }
    return res.json();
  },
  async listShares() {
    const res = await authedFetch("/shares");
    if (!res.ok) throw new Error("Failed to list shares");
    const data = await res.json();
    return data.shares;
  },
  async revokeShare(id) {
    const res = await authedFetch(`/shares/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to revoke share");
  },
  getLanIp() {
    const nets = node_os.networkInterfaces();
    for (const iface of Object.values(nets)) {
      if (!iface) continue;
      for (const n of iface) {
        if (n.family === "IPv4" && !n.internal) return n.address;
      }
    }
    return null;
  },
  async getPublicIp() {
    const res = await fetch("https://api.ipify.org?format=json");
    if (!res.ok) throw new Error("Could not detect public IP");
    const data = await res.json();
    return data.ip;
  }
};
let client = null;
let ready = null;
function initOrchester() {
  if (ready) return ready;
  ready = client$1.ensureDaemon().then((c) => {
    client = c;
    c.subscribe((services) => {
      for (const win of electron.BrowserWindow.getAllWindows()) {
        win.webContents.send("orchester:status-change", services);
      }
    });
    return c;
  });
  return ready;
}
async function get() {
  return client ?? await initOrchester();
}
const orchesterAdapter = {
  status: async () => (await get()).status(),
  start: async (id) => (await get()).start(id),
  stop: async (id) => (await get()).stop(id),
  restart: async (id) => (await get()).restart(id),
  configure: async (id, opts) => (await get()).configure(id, opts),
  addShare: async (opts) => (await get()).addShare(opts),
  removeShare: async (id) => (await get()).removeShare(id),
  updateShare: async (id, patch) => (await get()).updateShare(id, patch),
  close: () => {
    client?.close();
    client = null;
    ready = null;
  }
};
function registerIpc() {
  void initOrchester();
  electron.ipcMain.handle("fs:homeDir", () => homeDir());
  electron.ipcMain.handle("fs:listDir", (_e, p) => listDir(p));
  electron.ipcMain.handle("fs:stat", (_e, p) => stat(p));
  electron.ipcMain.handle(
    "fs:readText",
    (_e, p, maxBytes) => readText(p, maxBytes)
  );
  electron.ipcMain.handle(
    "fs:writeText",
    (_e, p, content) => writeText(p, content)
  );
  electron.ipcMain.handle("fs:rename", (_e, p, newName) => rename(p, newName));
  electron.ipcMain.handle("fs:move", (_e, src, destDir) => move(src, destDir));
  electron.ipcMain.handle("fs:mkdir", (_e, parent, name) => mkdir(parent, name));
  electron.ipcMain.handle("fs:copy", (_e, src, destDir) => copy(src, destDir));
  electron.ipcMain.handle("fs:trash", (_e, p) => trash(p));
  electron.ipcMain.handle("service:status", () => getStatus());
  electron.ipcMain.handle("service:start", (_e, port) => startServer(port));
  electron.ipcMain.handle("service:stop", () => stopServer());
  electron.ipcMain.handle("scraper:status", () => getScraperStatus());
  electron.ipcMain.handle("scraper:install", (e) => {
    const win = electron.BrowserWindow.fromWebContents(e.sender);
    return installScraper((line) => {
      win?.webContents.send("scraper:progress", line);
    });
  });
  electron.ipcMain.handle("metadata:read", (_e, folderPath) => readMetadata(folderPath));
  electron.ipcMain.handle(
    "metadata:write",
    (_e, folderPath, metadata) => writeMetadata(folderPath, metadata)
  );
  electron.ipcMain.handle(
    "metadata:updateTitle",
    (_e, folderPath, title) => updateFolderTitle(folderPath, title)
  );
  electron.ipcMain.handle(
    "metadata:updateGridItem",
    (_e, folderPath, itemPath, layout) => updateGridItem(folderPath, itemPath, layout)
  );
  electron.ipcMain.handle(
    "metadata:updateItemVisualization",
    (_e, folderPath, itemPath, type) => updateItemVisualization(folderPath, itemPath, type)
  );
  electron.ipcMain.handle(
    "tunnel:login",
    (_e, email, password) => tunnelClient.login(email, password)
  );
  electron.ipcMain.handle("tunnel:isLoggedIn", () => tunnelClient.isLoggedIn());
  electron.ipcMain.handle("tunnel:logout", () => tunnelClient.logout());
  electron.ipcMain.handle(
    "tunnel:createShare",
    (_e, opts) => tunnelClient.createShare(opts)
  );
  electron.ipcMain.handle("tunnel:listShares", () => tunnelClient.listShares());
  electron.ipcMain.handle("tunnel:revokeShare", (_e, id) => tunnelClient.revokeShare(id));
  electron.ipcMain.handle("tunnel:getLanIp", () => tunnelClient.getLanIp());
  electron.ipcMain.handle("tunnel:getPublicIp", () => tunnelClient.getPublicIp());
  electron.ipcMain.handle("terminal:create", (e, cwd) => {
    const win = electron.BrowserWindow.fromWebContents(e.sender);
    if (!win) throw new Error("No window");
    return createTerminal(win, cwd);
  });
  electron.ipcMain.handle(
    "terminal:write",
    (_e, id, data) => writeTerminal(id, data)
  );
  electron.ipcMain.handle(
    "terminal:resize",
    (_e, id, cols, rows) => resizeTerminal(id, cols, rows)
  );
  electron.ipcMain.handle(
    "terminal:kill",
    (_e, id) => killTerminal(id)
  );
  electron.ipcMain.handle("dialog:pickDirectory", async (e) => {
    const win = electron.BrowserWindow.fromWebContents(e.sender);
    const result = await electron.dialog.showOpenDialog(win ?? electron.BrowserWindow.getAllWindows()[0], {
      properties: ["openDirectory"],
      title: "Select directory to serve"
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  electron.ipcMain.handle("orchester:status", () => orchesterAdapter.status());
  electron.ipcMain.handle("orchester:start", (_e, id) => orchesterAdapter.start(id));
  electron.ipcMain.handle("orchester:stop", (_e, id) => orchesterAdapter.stop(id));
  electron.ipcMain.handle("orchester:restart", (_e, id) => orchesterAdapter.restart(id));
  electron.ipcMain.handle(
    "orchester:configure",
    (_e, id, opts) => orchesterAdapter.configure(id, opts)
  );
  electron.ipcMain.handle(
    "orchester:addShare",
    (_e, opts) => orchesterAdapter.addShare(opts)
  );
  electron.ipcMain.handle("orchester:removeShare", (_e, id) => orchesterAdapter.removeShare(id));
  electron.ipcMain.handle(
    "orchester:updateShare",
    (_e, id, patch) => orchesterAdapter.updateShare(id, patch)
  );
  electron.ipcMain.handle("presence:devices", () => presenceService.list());
  presenceService.on("change", (devices) => {
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send("presence:change", devices);
    }
  });
}
const dirname = __dirname;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: "Elio Files",
    backgroundColor: "#0b0d10",
    titleBarStyle: "hiddenInset",
    // native macOS traffic lights, our own chrome
    webPreferences: {
      preload: node_path.join(dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false lets the preload load as ESM; contextIsolation is the
      // real guard. Renderer still has no Node/ipc access beyond window.fsApi.
      sandbox: false
    }
  });
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(node_path.join(dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  registerIpc();
  createWindow();
  void startServer();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("before-quit", () => {
  killAllTerminals();
  void stopServer();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
