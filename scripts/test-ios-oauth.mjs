import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { URL, URLSearchParams } from 'node:url';
import console from 'node:console';

let callback;
const context = vm.createContext({
  routerAdd(method, route, handler) { assert.equal(method, 'GET'); assert.equal(route, '/api/pokus/ios-oauth'); callback = handler; },
  BadRequestError: Error,
});
vm.runInContext(await readFile('pb_hooks/ios_oauth.pb.js', 'utf8'), context);
function run(params) {
  const headers = new Map();
  const response = callback({
    request: { url: { query: () => new URLSearchParams(params) } },
    response: { header: () => ({ set: (name, value) => headers.set(name, value) }) },
    redirect: (status, url) => ({ status, url }),
  });
  return { response, headers };
}
const { response, headers } = run({ code: 'code&value', state: 'random-state', redirect: 'https://untrusted.example' });
assert.equal(response.status, 302);
assert.equal(new URL(response.url).origin, 'null');
assert.equal(new URL(response.url).host, 'oauth');
assert.equal(new URL(response.url).protocol, 'pokus:');
assert.equal(new URL(response.url).searchParams.get('code'), 'code&value');
assert.equal(headers.get('Cache-Control'), 'no-store');
assert.equal(headers.get('Referrer-Policy'), 'no-referrer');
assert.equal(new URL(run({ error: 'access_denied', state: 'state' }).response.url).searchParams.get('error'), 'access_denied');
assert.throws(() => run({ code: 'no-state' }));
assert.throws(() => run({ state: 'state' }));
assert.throws(() => run({ code: 'x'.repeat(4097), state: 'state' }));
console.log('PASS: iOS OAuth callback encoding, fixed destination, error callback, cache headers, and validation.');
