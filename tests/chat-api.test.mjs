import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../api/chat.js', import.meta.url), 'utf8');
const { default: handler } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

async function invoke(req) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  await handler(req, res);
  return { statusCode, payload, headers };
}

test('rejects non-POST requests', async () => {
  const result = await invoke({ method: 'GET' });
  assert.equal(result.statusCode, 405);
  assert.deepEqual(result.headers.Allow, ['POST']);
});

test('rejects missing or empty messages and invalid modes', async () => {
  for (const body of [
    { mode: 'review' },
    { mode: 'review', messages: [] },
    { mode: 'other', messages: [{ role: 'user', content: 'hello' }] },
  ]) {
    const result = await invoke({ method: 'POST', body });
    assert.equal(result.statusCode, 400);
  }
});

test('rejects conversations over 20 messages and messages over 6000 characters', async () => {
  const tooMany = await invoke({
    method: 'POST',
    body: { mode: 'interview', messages: Array.from({ length: 21 }, () => ({ content: 'x' })) },
  });
  const tooLong = await invoke({
    method: 'POST',
    body: { mode: 'review', messages: [{ role: 'user', content: 'x'.repeat(6001) }] },
  });

  assert.equal(tooMany.statusCode, 400);
  assert.equal(tooLong.statusCode, 400);
});

test('uses field and exact role in the review system prompt and returns the reply', async (context) => {
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = 'test-key';
  let sentPayload;
  globalThis.fetch = async (_url, options) => {
    sentPayload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'mock reply' } }] }),
    };
  };

  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = originalApiKey;
    }
  });

  const result = await invoke({
    method: 'POST',
    body: {
      mode: 'review',
      field: 'Tech',
      exactRole: 'Product Designer',
      messages: [{ role: 'user', content: 'Resume text' }],
    },
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, { reply: 'mock reply' });
  assert.match(sentPayload.messages[0].content, /Tech/);
  assert.match(sentPayload.messages[0].content, /Product Designer/);
});
