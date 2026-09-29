import { describe, expect, it } from 'vitest';
import { signBatch, verifyBatchSignature } from '$lib/server/ingest/signature';

const secret = 'test-secret';
const body = Buffer.from('{"events":[]}');

describe('collector signatures', () => {
  it('matches the fixed vector the collector checks too', () => {
    expect(signBatch('magpie-test-secret', 1_790_000_000, '{"events":[]}')).toBe(
      'sha256=18ba1c3054072f195dbbbbdc3aa0225a04cbb301d26bdf0dd893ce39ecbb9bff'
    );
  });

  it('agrees with the collector on a full batch body', () => {
    const body =
      '{"collector":{"name":"magpie-collector","version":"0.1.0","run_id":"00000000-0000-4000-8000-000000000000","os":"windows","arch":"amd64"},"server":null,"events":[]}';
    expect(signBatch('magpie-test-secret', 1_790_000_000, body)).toBe(
      'sha256=b359bb2e11a32bbc1e2c17efb67aafc0e46ec1fb68ac28665484d766c23d924c'
    );
  });

  it('accepts a correctly signed batch inside the window', () => {
    const now = 1_790_000_000;
    const signature = signBatch(secret, now - 100, body);
    expect(verifyBatchSignature(secret, String(now - 100), signature, body, now).ok).toBe(true);
  });

  it('rejects stale timestamps, bad signatures and malformed headers', () => {
    const now = 1_790_000_000;
    const signature = signBatch(secret, now - 400, body);
    expect(verifyBatchSignature(secret, String(now - 400), signature, body, now).failure).toBe(
      'stale_timestamp'
    );
    const fresh = signBatch(secret, now, body);
    expect(
      verifyBatchSignature(secret, String(now), fresh, Buffer.from('{"events":[1]}'), now).failure
    ).toBe('bad_signature');
    expect(verifyBatchSignature('other', String(now), fresh, body, now).failure).toBe(
      'bad_signature'
    );
    expect(verifyBatchSignature(secret, null, fresh, body, now).failure).toBe('missing_timestamp');
    expect(verifyBatchSignature(secret, 'soon', fresh, body, now).failure).toBe(
      'invalid_timestamp'
    );
    expect(verifyBatchSignature(secret, String(now), null, body, now).failure).toBe(
      'missing_signature'
    );
    expect(verifyBatchSignature(secret, String(now), 'sha256=zz', body, now).failure).toBe(
      'malformed_signature'
    );
  });
});
