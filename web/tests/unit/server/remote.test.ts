import { describe, expect, it } from 'vitest';
import { remoteObservationOf } from '../../../src/lib/server/read/status';

describe('remote observation metadata', () => {
  it('retains source cadence and successful check times while excluding connection details', () => {
    expect(
      remoteObservationOf({
        logs_poll_s: 5,
        saves_poll_s: 30,
        logs_checked_at: '2026-09-28T12:00:00Z',
        saves_checked_at: null,
        url: 'sftp://private',
        password: 'private'
      })
    ).toEqual({
      logs_poll_s: 5,
      saves_poll_s: 30,
      logs_checked_at: '2026-09-28T12:00:00.000Z',
      saves_checked_at: null
    });
  });
  it('does not invent checks or polling for older collectors', () => {
    expect(remoteObservationOf(undefined)).toBeNull();
    expect(remoteObservationOf({ logs_poll_s: -1, saves_poll_s: NaN })).toBeNull();
    expect(remoteObservationOf({ logs_poll_s: 5, logs_checked_at: 'not a time' })).toEqual({
      logs_poll_s: 5,
      saves_poll_s: null,
      logs_checked_at: null,
      saves_checked_at: null
    });
  });
});
