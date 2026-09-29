import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRateLimiter } from '../../src/lib/server/http/rateLimit';
import { POST as login } from '../../src/routes/api/v1/admin/login/+server';
import { POST as setup } from '../../src/routes/api/v1/admin/setup/+server';
import { resetDatabase, routeEvent, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const password = 'a long enough password';

function post(path: string, origin?: string): Request {
  return new Request(`http://test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ password })
  });
}

beforeEach(async () => {
  useTestDatabase();
  await resetDatabase();
  loginRateLimiter.reset();
});

describe('admin login', () => {
  it('needs an Origin header from this site', async () => {
    const created = await setup(routeEvent(post('/api/v1/admin/setup', 'http://test')));
    expect(created.status).toBe(204);

    const missing = await login(routeEvent(post('/api/v1/admin/login')));
    expect(missing.status).toBe(403);
    const foreign = await login(
      routeEvent(post('/api/v1/admin/login', 'https://evil.example.net'))
    );
    expect(foreign.status).toBe(403);
    const same = await login(routeEvent(post('/api/v1/admin/login', 'http://test')));
    expect(same.status).toBe(204);
    expect(same.headers.get('set-cookie')).toMatch(/^admin_session=/);
  });
});
