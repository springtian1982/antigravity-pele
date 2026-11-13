/*! antigravity-pele | SPDX-License-Identifier: MIT | Copyright (c) 2026 springtian <springtian@gmail.com> */
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/mcp/index.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_module = require("node:module");
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_readline = __toESM(require("node:readline"), 1);
var localRequire = (0, import_node_module.createRequire)(
  typeof __filename === "string" ? __filename : import_node_path.default.join(process.cwd(), "dist", "mcp.cjs")
);
var cachedWorker = null;
var cachedWorkerPath = "";
var cachedMtimeMs = -1;
var watchedPath = null;
function resolveWorkerPath() {
  const localDir = typeof __dirname === "string" ? __dirname : import_node_path.default.join(process.cwd(), "dist");
  const primary = import_node_path.default.join(localDir, "mcp-worker.cjs");
  if (import_node_fs.default.existsSync(primary)) {
    return primary;
  }
  return import_node_path.default.join(
    import_node_os.default.homedir(),
    ".gemini",
    "config",
    "plugins",
    "antigravity-pele",
    "dist",
    "mcp-worker.cjs"
  );
}
function loadWorker() {
  const workerPath = resolveWorkerPath();
  const stat = import_node_fs.default.statSync(workerPath);
  if (!cachedWorker || workerPath !== cachedWorkerPath || stat.mtimeMs !== cachedMtimeMs) {
    const resolved = localRequire.resolve(workerPath);
    if (localRequire.cache && localRequire.cache[resolved]) {
      delete localRequire.cache[resolved];
    }
    const mod = localRequire(resolved);
    cachedWorker = mod;
    cachedWorkerPath = workerPath;
    cachedMtimeMs = stat.mtimeMs;
  }
  return cachedWorker;
}
function sendResponse(obj) {
  process.stdout.write(`${JSON.stringify(obj)}
`);
}
function startWatchingWorker() {
  const workerPath = resolveWorkerPath();
  if (watchedPath === workerPath) return;
  if (watchedPath) {
    import_node_fs.default.unwatchFile(watchedPath);
  }
  watchedPath = workerPath;
  import_node_fs.default.watchFile(workerPath, { interval: 1500, persistent: false }, (curr, prev) => {
    if (curr.mtimeMs > 0 && curr.mtimeMs !== prev.mtimeMs) {
      cachedMtimeMs = -1;
      sendResponse({
        jsonrpc: "2.0",
        method: "notifications/tools/list_changed"
      });
    }
  });
}
function handleRpcLine(line) {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  if (!req || typeof req !== "object") return;
  const id = req.id ?? null;
  const method = typeof req.method === "string" ? req.method : "";
  const params = typeof req.params === "object" && req.params !== null ? req.params : {};
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return;
  }
  if (method === "initialize") {
    const requestedVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : "2024-11-05";
    sendResponse({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: requestedVersion,
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "antigravity-pele", version: "0.1.0" }
      }
    });
    startWatchingWorker();
    return;
  }
  if (method === "ping") {
    sendResponse({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list") {
    try {
      const worker = loadWorker();
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: { tools: worker.TOOLS }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: `Failed to load Pele worker: ${message}` }
      });
    }
    return;
  }
  if (method === "tools/call") {
    const toolName = typeof params.name === "string" ? params.name : "";
    const args = typeof params.arguments === "object" && params.arguments !== null ? params.arguments : {};
    let worker;
    try {
      worker = loadWorker();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: message }) }],
          isError: true
        }
      });
      return;
    }
    const convId = worker.extractConversationId(params);
    try {
      const result = worker.handleToolCall(toolName, args, convId);
      sendResponse({ jsonrpc: "2.0", id, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: worker.textResult({ ok: false, error: message }, true)
      });
    }
    return;
  }
  if (id !== null) {
    sendResponse({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  }
}
var rl = import_node_readline.default.createInterface({
  input: process.stdin,
  terminal: false
});
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  handleRpcLine(trimmed);
});
rl.on("close", () => {
  if (watchedPath) {
    import_node_fs.default.unwatchFile(watchedPath);
    watchedPath = null;
  }
});
