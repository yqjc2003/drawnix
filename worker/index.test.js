import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token) => {
    if (!['alice', 'bob'].includes(token)) throw new Error('invalid');
    return { payload: { sub: token, email: token + '@example.com' } };
  },
}));
import worker from './index.js';

let env;
const origin = 'https://draw.yqjc2003.workers.dev';
function request(path, method = 'GET', token = 'alice', data, requestOrigin = origin) {
  const headers = { 'cf-access-jwt-assertion': token, Origin: requestOrigin };
  return worker.fetch(new Request(origin + path.replace('/api/', '/api/private/'), { method, headers, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }), env);
}
beforeEach(() => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_boards.sql', 'utf8'));
  env = {
    ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'https://yqjc.cloudflareaccess.com',
    DB: { prepare(sql) { return { bind(...params) { return {
      async first() { return sqlite.prepare(sql).get(...params) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
      async run() { const result = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(result.changes) } }; },
    }; } }; } },
  };
});
describe('board access and concurrency', () => {
  it('rejects invalid identity and cross-origin mutations', async () => {
    expect((await request('/api/boards', 'GET', 'bad')).status).toBe(401);
    expect((await request('/api/boards', 'POST', 'alice', {}, 'https://example.com')).status).toBe(403);
  });
  it('isolates users and detects stale updates and deletes', async () => {
    const created = await (await request('/api/boards', 'POST', 'alice', { title: 'A', content: { children: [] } })).json();
    expect((await request('/api/boards/' + created.id, 'GET', 'bob')).status).toBe(404);
    expect((await (await request('/api/boards', 'GET', 'bob')).json()).boards).toHaveLength(0);
    expect((await request('/api/boards/' + created.id, 'PUT', 'bob', { title: 'B', content: { children: [] }, version: 1 })).status).toBe(404);
    expect((await request('/api/boards/' + created.id + '?version=1', 'DELETE', 'bob')).status).toBe(409);
    expect((await request('/api/boards/' + created.id, 'PUT', 'alice', { title: 'New', content: { children: [] }, version: 1 })).status).toBe(200);
    expect((await request('/api/boards/' + created.id, 'PUT', 'alice', { title: 'Old', content: { children: [] }, version: 1 })).status).toBe(409);
    expect((await request('/api/boards/' + created.id + '?version=1', 'DELETE', 'alice')).status).toBe(409);
    expect((await request('/api/boards/' + created.id + '?version=2', 'DELETE', 'alice')).status).toBe(200);
  });
});
