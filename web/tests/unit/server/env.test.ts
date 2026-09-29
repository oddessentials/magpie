import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '$lib/server/env';

const database = { DATABASE_URL: 'postgres://magpie:magpie@db:5432/magpie' };

describe('the environment', () => {
  it('needs only the database address and defaults everything else', () => {
    const env = validateEnvironment(database);
    expect(env).toMatchObject({
      databaseUrl: database.DATABASE_URL,
      collectorSecret: '',
      adminPassword: '',
      adminSessionSecret: '',
      publicSiteName: '',
      origin: '',
      port: 3000,
      apiMock: false,
      logLevel: 'info',
      backupDir: '/backups',
      backupsKept: 14
    });
  });

  it('reports a missing database address', () => {
    expect(() => validateEnvironment({})).toThrow(/missing environment variables: DATABASE_URL/);
  });

  it('keeps the values that are set', () => {
    const env = validateEnvironment({
      ...database,
      COLLECTOR_SECRET: 'collector-secret-for-tests',
      PUBLIC_SITE_NAME: 'Sunreach',
      API_MOCK: '1',
      LOG_LEVEL: 'debug',
      BACKUPS_KEPT: '3'
    });
    expect(env).toMatchObject({
      collectorSecret: 'collector-secret-for-tests',
      publicSiteName: 'Sunreach',
      apiMock: true,
      logLevel: 'debug',
      backupsKept: 3
    });
  });

  it('rejects values that cannot work', () => {
    expect(() => validateEnvironment({ ...database, API_MOCK: 'yes' })).toThrow(
      /API_MOCK must be 0, 1, true or false/
    );
    expect(() => validateEnvironment({ ...database, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL must be one of/
    );
    expect(() => validateEnvironment({ ...database, BACKUPS_KEPT: '-1' })).toThrow(
      /BACKUPS_KEPT must be a non-negative integer/
    );
  });

  it('refuses a short or overlong admin password', () => {
    expect(() => validateEnvironment({ ...database, ADMIN_PASSWORD: 'admin' })).toThrow(
      /ADMIN_PASSWORD must be 8 to 200 characters/
    );
    expect(() => validateEnvironment({ ...database, ADMIN_PASSWORD: 'x'.repeat(201) })).toThrow(
      /ADMIN_PASSWORD must be 8 to 200 characters/
    );
    expect(validateEnvironment({ ...database, ADMIN_PASSWORD: 'eight ch' }).adminPassword).toBe(
      'eight ch'
    );
  });

  it('refuses the published example secrets and short secrets', () => {
    expect(() =>
      validateEnvironment({ ...database, COLLECTOR_SECRET: 'local-collector-secret-change-me' })
    ).toThrow(/COLLECTOR_SECRET is the published example value/);
    expect(() =>
      validateEnvironment({ ...database, ADMIN_SESSION_SECRET: 'local-session-secret-change-me' })
    ).toThrow(/ADMIN_SESSION_SECRET is the published example value/);
    expect(() => validateEnvironment({ ...database, COLLECTOR_SECRET: 'short' })).toThrow(
      /COLLECTOR_SECRET must be at least 16 characters/
    );
    expect(() => validateEnvironment({ ...database, ADMIN_SESSION_SECRET: 'short' })).toThrow(
      /ADMIN_SESSION_SECRET must be at least 16 characters/
    );
  });
});
