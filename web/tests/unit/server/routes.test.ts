import { describe, expect, it } from 'vitest';
import { clientAddress } from '$lib/server/http/routes';

describe('the client address used for rate limits', () => {
  it('comes from the connection, never from a request header', () => {
    const event = {
      request: new Request('http://guild.example.com/api/v1/status', {
        headers: { 'x-forwarded-for': '198.51.100.7, 203.0.113.9' }
      }),
      getClientAddress: () => '192.0.2.44'
    };
    expect(clientAddress(event)).toBe('192.0.2.44');
  });

  it('is unknown when the adapter cannot tell', () => {
    const event = {
      getClientAddress: () => {
        throw new Error('no address');
      }
    };
    expect(clientAddress(event)).toBe('unknown');
  });
});
