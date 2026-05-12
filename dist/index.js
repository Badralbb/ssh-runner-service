"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const p_queue_1 = __importDefault(require("p-queue"));
const ssh_executor_1 = require("./ssh-executor");
const node_https_1 = __importDefault(require("node:https"));
const CONCURRENCY = Number(process.env.SSH_CONCURRENCY ?? 50);
const MAX_QUEUE = Number(process.env.SSH_MAX_QUEUE ?? 500);
const queue = new p_queue_1.default({ concurrency: CONCURRENCY });
const PORT = Number(process.env.PORT ?? 3022);
const SECRET = process.env.SSH_RUNNER_SECRET ?? "";
const API_BASE_URL = process.env.UNIFI_API_BASE_URL ??
    "https://192.168.1.1/proxy/network/api/s/default";
const API_KEY = process.env.UNIFI_API_KEY ?? "Cdq4u6nk37CjqY_LQHgSeEtdP9kkTHvf";
const MAC_ADDRESS_REGEX = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const DEFAULT_MAX_SCRIPT_BYTES = 262144; // 256 KiB
const DEFAULT_SCRIPT_FETCH_TIMEOUT_MS = 15000;
function parseRunPayload(body) {
    if (body === null || typeof body !== "object") {
        return { ok: false, error: "Request body must be a JSON object" };
    }
    const { ip, script, scriptUrl } = body;
    if (typeof ip !== "string" || !ip.trim()) {
        return { ok: false, error: "Missing or invalid ip" };
    }
    const trimmedIp = ip.trim();
    if (/[\r\n]/.test(trimmedIp)) {
        return { ok: false, error: "ip must not contain newlines" };
    }
    const hasScript = typeof script === "string" && script.trim().length > 0;
    const hasUrl = typeof scriptUrl === "string" && scriptUrl.trim().length > 0;
    if (hasScript === hasUrl) {
        return {
            ok: false,
            error: "Provide exactly one of: script (string) or scriptUrl (string URL)",
        };
    }
    return { ok: true, ip: trimmedIp, script: hasScript ? script.trim() : "" };
}
async function fetchScriptFromUrl(scriptUrl) {
    const maxBytes = Number(process.env.SSH_MAX_SCRIPT_BYTES ?? DEFAULT_MAX_SCRIPT_BYTES);
    const timeoutMs = Number(process.env.SSH_SCRIPT_FETCH_TIMEOUT_MS ?? DEFAULT_SCRIPT_FETCH_TIMEOUT_MS);
    let url;
    try {
        url = new URL(scriptUrl.trim());
    }
    catch {
        throw new Error("scriptUrl is not a valid URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("scriptUrl must use http or https");
    }
    if (url.protocol === "http:" &&
        process.env.SSH_ALLOW_HTTP_SCRIPT_URL !== "1") {
        throw new Error("http script URLs are disabled; use https or set SSH_ALLOW_HTTP_SCRIPT_URL=1");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const apiRes = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: { Accept: "text/plain, application/json, */*" },
        });
        if (!apiRes.ok) {
            throw new Error(`Failed to fetch script: HTTP ${apiRes.status}`);
        }
        const buf = await apiRes.arrayBuffer();
        if (buf.byteLength > maxBytes) {
            throw new Error(`Fetched script exceeds maximum size (${maxBytes} bytes)`);
        }
        return new TextDecoder("utf-8", { fatal: false }).decode(buf).trim();
    }
    catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            throw new Error("Timed out while fetching scriptUrl");
        }
        throw e;
    }
    finally {
        clearTimeout(timer);
    }
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
function proxyUnifiRequest(path) {
    return new Promise((resolve, reject) => {
        const req = node_https_1.default.request(`${API_BASE_URL}${path}`, {
            method: "GET",
            headers: {
                "X-API-KEY": API_KEY,
            },
            rejectUnauthorized: false,
        }, (apiRes) => {
            let data = "";
            apiRes.on("data", (chunk) => {
                data += chunk.toString();
            });
            apiRes.on("end", () => {
                resolve({
                    statusCode: apiRes.statusCode || 500,
                    contentType: apiRes.headers["content-type"] || "",
                    body: data,
                });
            });
        });
        req.on("error", reject);
        req.end();
    });
}
// Info route
app.get("/", (_req, res) => {
    res.json({
        ok: true,
        message: "Use POST /run, GET /stations, or GET /user/:mac",
    });
});
app.post("/run", async (req, res) => {
    if (!SECRET) {
        throw new Error("Missing SSH_RUNNER_SECRET");
    }
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${SECRET}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (queue.size >= MAX_QUEUE) {
        res.status(429).json({ error: "Too many requests, try again later" });
        return;
    }
    const parsed = parseRunPayload(req.body);
    if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
    }
    const maxScriptBytes = Number(process.env.SSH_MAX_SCRIPT_BYTES ?? DEFAULT_MAX_SCRIPT_BYTES);
    let script;
    try {
        if (parsed.script.length > 0) {
            script = parsed.script;
        }
        else {
            const url = req.body.scriptUrl.trim();
            script = await fetchScriptFromUrl(url);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(400).json({ error: message });
        return;
    }
    if (!script.length) {
        res.status(400).json({ error: "Resolved script is empty" });
        return;
    }
    if (Buffer.byteLength(script, "utf8") > maxScriptBytes) {
        res.status(400).json({
            error: `script exceeds maximum size (${maxScriptBytes} bytes)`,
        });
        return;
    }
    let durationMs = 0;
    try {
        const result = await queue.add(async () => {
            const started = Date.now();
            try {
                const output = await (0, ssh_executor_1.runScript)({ ip: parsed.ip, script });
                durationMs = Date.now() - started;
                return { ...output, durationMs };
            }
            catch (e) {
                durationMs = Date.now() - started;
                throw e;
            }
        });
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message, durationMs });
    }
});
app.get("/stations", async (_req, res) => {
    try {
        const response = await proxyUnifiRequest("/stat/sta");
        res.status(response.statusCode);
        if (response.contentType.includes("application/json")) {
            res.json(JSON.parse(response.body));
            return;
        }
        res.type("text/plain").send(response.body);
    }
    catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
app.get("/user/:mac", async (req, res) => {
    const mac = req.params.mac.toLocaleLowerCase();
    if (!MAC_ADDRESS_REGEX.test(mac)) {
        res.status(400).json({
            error: "Invalid MAC address. Expected format: e4:24:6c:86:24:dd",
        });
        return;
    }
    try {
        const response = await proxyUnifiRequest(`/stat/user/${encodeURIComponent(mac)}`);
        res.status(response.statusCode);
        if (response.contentType.includes("application/json")) {
            res.json(JSON.parse(response.body));
            return;
        }
        res.type("text/plain").send(response.body);
    }
    catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});
app.use((err, req, res, next) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
});
app.listen(PORT, () => {
    console.log(`SSH runner service listening on port ${PORT}`);
});
