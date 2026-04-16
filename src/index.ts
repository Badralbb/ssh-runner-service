import "dotenv/config";
import express from "express";
import PQueue from "p-queue";
import { runScript } from "./ssh-executor";
import https from "node:https";

const CONCURRENCY = Number(process.env.SSH_CONCURRENCY ?? 50);
const MAX_QUEUE = Number(process.env.SSH_MAX_QUEUE ?? 500);
const queue = new PQueue({ concurrency: CONCURRENCY });

const PORT = Number(process.env.PORT ?? 3022);
const SECRET = process.env.SSH_RUNNER_SECRET ?? "";
const API_BASE_URL = process.env.UNIFI_API_BASE_URL ?? "https://192.168.1.1/proxy/network/api/s/default";
const API_KEY = process.env.UNIFI_API_KEY ?? "Cdq4u6nk37CjqY_LQHgSeEtdP9kkTHvf";
const MAC_ADDRESS_REGEX = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

type RunPayload = {
  ip: string;
  script: string;
};

const app = express();

app.use(express.json());


function proxyUnifiRequest(path: string): Promise<{ statusCode: number; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${API_BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          "X-API-KEY": API_KEY,
        },
        rejectUnauthorized: false,
      },
      (apiRes) => {
        let data = "";

        apiRes.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });

        apiRes.on("end", () => {
          resolve({
            statusCode: apiRes.statusCode || 500,
            contentType: apiRes.headers["content-type"] || "",
            body: data,
          });
        });
      },
    );

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

  const { ip, script } = req.body as RunPayload;

  let startTime = 0;
  let endTime = 0;

  try {
    const result = await queue.add(async () => {
      startTime = Date.now();
      const output = await runScript({ ip, script });
      endTime = Date.now();
      return { ...output, durationMs: endTime - startTime }
    });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message, durationMs: endTime - startTime });
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
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/user/:mac", async (req, res) => {
  const mac = req.params.mac.toLocaleLowerCase();
  console.log("fdsfds")

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
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`SSH runner service listening on port ${PORT}`);
});
