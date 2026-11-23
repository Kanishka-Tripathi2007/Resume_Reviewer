import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(root, '.env.local');

try {
  const envContents = await readFile(envFile, 'utf8');
  for (const line of envContents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch {
  console.warn('No .env.local found. The chat API will need GROQ_API_KEY to be configured.');
}

const apiSource = await readFile(resolve(root, 'api/chat.js'), 'utf8');
const { default: chatHandler } = await import(
  `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
);

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/chatbot.css', ['chatbot.css', 'text/css; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/chatbot.js', ['chatbot.js', 'text/javascript; charset=utf-8']],
]);

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/api/chat') {
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 256 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Request body is too large.' }));
          return;
        }
      }

      const apiRes = {
        status(code) {
          res.statusCode = code;
          return this;
        },
        setHeader(name, value) {
          res.setHeader(name, value);
        },
        json(payload) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(payload));
          return this;
        },
      };

      await chatHandler({ method: req.method, body }, apiRes);
      if (!res.writableEnded) {
        res.end();
      }
    } catch {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ error: 'Could not process the chat request.' }));
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const asset = assets.get(pathname);
  if (!asset) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  try {
    const contents = await readFile(resolve(root, asset[0]));
    res.writeHead(200, {
      'Content-Type': asset[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Could not load the application file.');
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => {
  console.log(`Resume Reviewer running at http://localhost:${port}`);
});
