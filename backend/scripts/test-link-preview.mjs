import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { URL, URLSearchParams } from 'node:url';
import console from 'node:console';

let handler;
const fetched = [];
const context = vm.createContext({
  routerAdd(method, route, callback) { assert.equal(method, 'GET'); assert.equal(route, '/api/pokus/link-preview'); handler = callback; },
  BadRequestError: class BadRequestError extends Error {},
  $apis: { requireAuth: () => undefined },
  $app: { logger: () => ({ warn: () => undefined }) },
  $http: { send: ({ url }) => { fetched.push(url); return { statusCode: 200, headers: { 'Content-Type': ['text/html'] }, body: '<title>Hi</title>' }; } },
  toString: (value) => String(value),
});
vm.runInContext(await readFile(new URL('../pb_hooks/link_preview.pb.js', import.meta.url), 'utf8'), context);
const run = (url) => handler({
  request: { url: { query: () => new URLSearchParams({ url }) } },
  json: (status, body) => ({ status, body }),
});

for (const url of [
  'http://localhost/', 'http://localhost.:8090/', 'http://example.com.:80/', 'http://127.0.0.1/', 'http://0x7f000001/',
  'http://[::1]/', 'http://intranet/', 'http://pb.internal/', 'http://printer.local/', 'http://127.0.0.1.nip.io/',
  'http://10-0-0-1.sslip.io/', 'http://app.169.254.169.254.example.org/', 'http://public.example.org:8090/',
  'http://public.example.org:22/', 'ftp://example.org/', 'http://user@example.org/', 'http://news.example.org@127.0.0.1/',
  'http://news.example.org:80@127.0.0.1/',
]) {
  assert.throws(() => run(url), /cannot be previewed|valid http/, url);
}
assert.equal(fetched.length, 0);

for (const url of ['https://news.ycombinator.com/item?id=1', 'http://example.org:443/a', 'https://sub.blog-2024.org/post']) {
  assert.equal(run(url).body.title, 'Hi', url);
}
assert.equal(fetched.length, 3);
console.log('PASS: link preview refuses internal hosts, embedded IPs, trailing dots and non-web ports, and still previews public pages.');
