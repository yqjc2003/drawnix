import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL('https://yqjc.cloudflareaccess.com/cdn-cgi/access/certs'));
const MAX_BYTES = 1800000;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

async function identity(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
    });
    return typeof payload.sub === 'string' && payload.sub && typeof payload.email === 'string'
      ? { id: payload.sub, email: payload.email }
      : null;
  } catch {
    return null;
  }
}

async function body(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('too_large');
  try { return JSON.parse(text); } catch { throw new Error('invalid'); }
}

function validContent(content) {
  return content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.children);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    const user = await identity(request, env);
    if (!user) return json({ error: '请重新登录' }, 401);
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) {
      return json({ error: '请求来源无效' }, 403);
    }
    if (url.pathname === '/api/private/login' && request.method === 'GET') return Response.redirect(url.origin + '/', 302);
    if (url.pathname === '/api/private/me' && request.method === 'GET') return json({ email: user.email });
    const match = url.pathname.match(/^\/api\/private\/boards(?:\/([0-9a-f-]{36}))?$/);
    if (!match) return json({ error: 'Not found' }, 404);
    const id = match[1];
    try {
      if (!id && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT id, title, version, created_at, updated_at FROM boards WHERE owner_id = ? ORDER BY updated_at DESC').bind(user.id).all();
        return json({ boards: result.results });
      }
      if (!id && request.method === 'POST') {
        const input = await body(request);
        if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || !validContent(input.content)) return json({ error: '画布内容或名称无效' }, 400);
        const boardId = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.DB.prepare('INSERT INTO boards (id, owner_id, title, content, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').bind(boardId, user.id, input.title.trim(), JSON.stringify(input.content), now, now).run();
        return json({ id: boardId, title: input.title.trim(), content: input.content, version: 1, created_at: now, updated_at: now }, 201);
      }
      if (id && request.method === 'GET') {
        const board = await env.DB.prepare('SELECT id, title, content, version, created_at, updated_at FROM boards WHERE id = ? AND owner_id = ?').bind(id, user.id).first();
        if (!board) return json({ error: '画布不存在' }, 404);
        return json({ ...board, content: JSON.parse(board.content) });
      }
      if (id && request.method === 'PUT') {
        const input = await body(request);
        if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || !validContent(input.content) || !Number.isSafeInteger(input.version) || input.version < 1) return json({ error: '画布内容或名称无效' }, 400);
        const result = await env.DB.prepare('UPDATE boards SET title = ?, content = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ?').bind(input.title.trim(), JSON.stringify(input.content), new Date().toISOString(), id, user.id, input.version).run();
        if (!result.meta.changes) {
          const existing = await env.DB.prepare('SELECT id FROM boards WHERE id = ? AND owner_id = ?').bind(id, user.id).first();
          return json({ error: existing ? '画布已在其他窗口修改，请复制当前内容后重新打开' : '画布不存在' }, existing ? 409 : 404);
        }
        return json({ version: input.version + 1 });
      }
      if (id && request.method === 'DELETE') {
        const version = Number(url.searchParams.get('version'));
        if (!Number.isSafeInteger(version) || version < 1) return json({ error: '版本无效' }, 400);
        const result = await env.DB.prepare('DELETE FROM boards WHERE id = ? AND owner_id = ? AND version = ?').bind(id, user.id, version).run();
        if (!result.meta.changes) return json({ error: '画布不存在或已在其他窗口修改' }, 409);
        return json({ ok: true });
      }
      return json({ error: 'Method not allowed' }, 405);
    } catch (error) {
      if (error.message === 'too_large') return json({ error: '画布过大，暂不支持超过 1.8 MB 的内容' }, 413);
      if (error.message === 'invalid') return json({ error: '请求格式无效' }, 400);
      console.error('Board API error', error);
      return json({ error: '保存或读取画布失败，请稍后重试' }, 500);
    }
  },
};
