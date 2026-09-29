import { describe, expect, it } from 'vitest';
import { ApiHttpError } from '$lib/server/http/respond';
import {
  defaultSettings,
  lockedFields,
  parseSettingsUpdate,
  resolveSettings,
  type SettingsEnvironment
} from '$lib/server/settings';

const unset: SettingsEnvironment = { publicSiteName: '' };

function rejection(body: unknown): string {
  try {
    parseSettingsUpdate(body);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(400);
    return (error as ApiHttpError).message;
  }
  throw new Error('the update was accepted');
}

describe('settings updates', () => {
  it('accepts each setting and trims text', () => {
    expect(parseSettingsUpdate({ site_name: '  Brynmoor ', features: { chat: true } })).toEqual({
      site_name: 'Brynmoor',
      features: { chat: true }
    });
  });

  it('rejects what it cannot store', () => {
    expect(rejection(null)).toMatch(/JSON object/);
    expect(rejection({ theme: 'dark' })).toMatch(/theme is not a setting/);
    expect(rejection({ site_name: '   ' })).toMatch(/1 to 60 characters/);
    expect(rejection({ site_name: 'x'.repeat(61) })).toMatch(/1 to 60 characters/);
    expect(rejection({ features: { weather: true } })).toMatch(/weather is not a feature/);
    expect(rejection({ features: { chat: 'off' } })).toMatch(/true or false/);
    expect(rejection({ retention: 30 })).toMatch(/retention must be an object/);
    expect(rejection({ retention: { chat_days: 30 } })).toMatch(/not a retention setting/);
    expect(rejection({ retention: { metrics_days: 0 } })).toMatch(/from 1 to 3650/);
    expect(rejection({ retention: { metrics_days: 2.5 } })).toMatch(/whole number/);
    expect(rejection({ retention: { status_samples_days: null } })).toMatch(/whole number/);
  });

  it('accepts retention periods', () => {
    expect(parseSettingsUpdate({ retention: { world_saves_days: 90, metrics_days: 7 } })).toEqual({
      retention: { world_saves_days: 90, metrics_days: 7 }
    });
  });
});

describe('resolved settings', () => {
  it('falls back to the defaults, with chat off', () => {
    expect(resolveSettings({}, unset)).toEqual({ ...defaultSettings, locked: [] });
    expect(defaultSettings.features.chat).toBe(false);
    expect(defaultSettings.features.positions).toBe(false);
  });

  it('uses stored values and ignores malformed ones', () => {
    expect(
      resolveSettings(
        {
          site_name: 'Brynmoor',
          features: { chat: true, pals: 'no' },
          retention: { metrics_days: 60, status_samples_days: 99999, world_saves_days: 'long' }
        },
        unset
      )
    ).toEqual({
      site_name: 'Brynmoor',
      features: { chat: true, positions: false },
      retention: { ...defaultSettings.retention, metrics_days: 60 },
      locked: []
    });
  });

  it('lets the environment win and marks the name locked', () => {
    const environment: SettingsEnvironment = { publicSiteName: 'From the environment' };
    expect(lockedFields(environment)).toEqual(['site_name']);
    expect(resolveSettings({ site_name: 'Stored' }, environment)).toMatchObject({
      site_name: 'From the environment',
      locked: ['site_name']
    });
  });
});
