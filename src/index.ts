import 'dotenv/config';
import http from 'node:http';
import PQueue from 'p-queue';
import { runScript } from './ssh-executor';

const CONCURRENCY = Number(process.env.SSH_CONCURRENCY ?? 50);
const MAX_QUEUE = Number(process.env.SSH_MAX_QUEUE ?? 500);
const queue = new PQueue({ concurrency: CONCURRENCY });

const PORT = Number(process.env.PORT ?? 3022);
const SECRET = process.env.SSH_RUNNER_SECRET ?? '';

type RunPayload = {
  ip: string;
  script: string;
};

const isAuthorized = (req: http.IncomingMessage): boolean => {
  if (!SECRET) return true;
  return req.headers['authorization'] === `Bearer ${SECRET}`;
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const handleRun = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  if (queue.size >= MAX_QUEUE) {
    sendJson(res, 429, { error: 'Too many requests, try again later' });
    return;
  }

  const raw = await readBody(req);
  const { ip, script } = JSON.parse(raw) as RunPayload;

  try {
    const result = await queue.add(() => runScript({ ip, script }));
    sendJson(res, 200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    sendJson(res, 500, { error: message });
  }
};

const server = http.createServer(async (req, res) => {
  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }
  if (req.method === 'POST' && req.url === '/run') {
    await handleRun(req, res);
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`SSH runner service listening on port ${PORT}`);
});
