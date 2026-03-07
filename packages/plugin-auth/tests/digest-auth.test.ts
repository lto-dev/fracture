import { describe, test, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { digestAuth } from '../src/index.js';
import type { Request, Auth, AuthExecutor, ProtocolResponse } from '@apiquest/types';

// ============================================================================
// Test helpers
// ============================================================================

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    type: 'request',
    id: 'req-1',
    name: 'Test Request',
    data: {
      method: 'GET',
      url: 'http://example.com/protected'
    },
    ...overrides
  };
}

function makeAuth(data: Record<string, string> = {}): Auth {
  return {
    type: 'digest',
    data: {
      username: 'testuser',
      password: 'testpass',
      ...data
    }
  };
}

function challengeResponse401(realm: string, nonce: string, qop?: string, algorithm?: string, opaque?: string): ProtocolResponse {
  let headerValue = `Digest realm="${realm}", nonce="${nonce}"`;
  if (qop !== undefined) headerValue += `, qop="${qop}"`;
  if (algorithm !== undefined) headerValue += `, algorithm=${algorithm}`;
  if (opaque !== undefined) headerValue += `, opaque="${opaque}"`;

  return {
    data: {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'www-authenticate': headerValue },
      body: ''
    },
    summary: { outcome: 'error', code: 401, label: 'Unauthorized', duration: 5 }
  };
}

function okResponse(): ProtocolResponse {
  return {
    data: {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'protected content'
    },
    summary: { outcome: 'success', code: 200, label: 'OK', duration: 10 }
  };
}

function makeTwoRoundExecutor(round1Response: ProtocolResponse, round2Response: ProtocolResponse): AuthExecutor {
  let callCount = 0;
  return {
    send: vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? round1Response : round2Response;
    })
  };
}

function md5(str: string): string {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

// ============================================================================
// Tests
// ============================================================================

describe('Digest Auth Plugin', () => {
  describe('Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(digestAuth.name).toBe('Digest Authentication');
      expect(digestAuth.version).toBe('1.0.0');
      expect(digestAuth.authTypes).toContain('digest');
    });

    test('should support http and graphql protocols', () => {
      expect(digestAuth.protocols).toContain('http');
      expect(digestAuth.protocols).toContain('graphql');
    });

    test('should have dataSchema with username and password', () => {
      const schema = digestAuth.dataSchema as { properties: Record<string, unknown> };
      expect(schema.properties['username']).toBeDefined();
      expect(schema.properties['password']).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation with username and password', () => {
      const auth = makeAuth();
      const result = digestAuth.validate(auth, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation without username', () => {
      const auth = makeAuth({ username: '' });
      const result = digestAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.toLowerCase().includes('username'))).toBe(true);
    });

    test('should fail validation without password', () => {
      const auth = makeAuth({ password: '' });
      const result = digestAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.toLowerCase().includes('password'))).toBe(true);
    });

    test('should fail with both missing', () => {
      const auth: Auth = { type: 'digest', data: {} };
      const result = digestAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('negotiate() — two-round exchange', () => {
    test('should call executor twice (probe then credentials)', async () => {
      const executor = makeTwoRoundExecutor(
        challengeResponse401('test-realm', 'testnonce123', 'auth'),
        okResponse()
      );

      const request = makeRequest();
      await digestAuth.negotiate!(request, makeAuth(), {}, executor, undefined);

      expect(executor.send).toHaveBeenCalledTimes(2);
    });

    test('should return request with Authorization: Digest header after round 2', async () => {
      const executor = makeTwoRoundExecutor(
        challengeResponse401('test-realm', 'testnonce123', 'auth'),
        okResponse()
      );

      const result = await digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);

      const headers = result.data.headers as Record<string, string>;
      expect(headers['Authorization']).toBeDefined();
      expect(headers['Authorization']).toMatch(/^Digest /);
    });

    test('should include realm, nonce, and username in Authorization header', async () => {
      const realm = 'example-realm';
      const nonce = 'nonce-abc-123';
      const executor = makeTwoRoundExecutor(
        challengeResponse401(realm, nonce, 'auth'),
        okResponse()
      );

      const result = await digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);

      const authHeader = (result.data.headers as Record<string, string>)['Authorization'];
      expect(authHeader).toContain(`realm="${realm}"`);
      expect(authHeader).toContain(`nonce="${nonce}"`);
      expect(authHeader).toContain(`username="testuser"`);
    });

    test('should include nc, cnonce, and qop when qop=auth', async () => {
      const executor = makeTwoRoundExecutor(
        challengeResponse401('realm', 'nonce', 'auth'),
        okResponse()
      );

      const result = await digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);
      const authHeader = (result.data.headers as Record<string, string>)['Authorization'];

      expect(authHeader).toContain('qop=auth');
      expect(authHeader).toContain('nc=00000001');
      expect(authHeader).toMatch(/cnonce="[a-f0-9]+"/);
    });

    test('should NOT include nc/cnonce when qop is absent (legacy Digest)', async () => {
      const executor = makeTwoRoundExecutor(
        challengeResponse401('realm', 'nonce', undefined, undefined, undefined),
        okResponse()
      );

      const result = await digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);
      const authHeader = (result.data.headers as Record<string, string>)['Authorization'];

      expect(authHeader).not.toContain('nc=');
      expect(authHeader).not.toContain('cnonce=');
      expect(authHeader).not.toContain('qop=');
    });

    test('should include opaque in header when server sends it', async () => {
      const executor = makeTwoRoundExecutor(
        challengeResponse401('realm', 'nonce', 'auth', undefined, 'opaque-value-123'),
        okResponse()
      );

      const result = await digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);
      const authHeader = (result.data.headers as Record<string, string>)['Authorization'];

      expect(authHeader).toContain('opaque="opaque-value-123"');
    });

    test('should compute correct MD5 response for known-good inputs', async () => {
      // RFC 2617 example values (without qop — legacy)
      const username = 'Mufasa';
      const password = 'Circle Of Life';
      const realm = 'testrealm@host.com';
      const nonce = 'dcd98b7102dd2f0e8b11d0f600bfb0c093';
      const method = 'GET';
      const uri = '/dir/index.html';

      const executor = makeTwoRoundExecutor(
        challengeResponse401(realm, nonce),
        okResponse()
      );

      const request = makeRequest({ data: { method, url: `http://example.com${uri}` } });
      const auth = makeAuth({ username, password });
      const result = await digestAuth.negotiate!(request, auth, {}, executor, undefined);
      const authHeader = (result.data.headers as Record<string, string>)['Authorization'];

      // Compute expected values
      const ha1 = md5(`${username}:${realm}:${password}`);
      const ha2 = md5(`${method}:${uri}`);
      const expectedResponse = md5(`${ha1}:${nonce}:${ha2}`);

      expect(authHeader).toContain(`response="${expectedResponse}"`);
    });

    test('should return original request unmodified when server returns non-401', async () => {
      // Server does not require auth
      const executor: AuthExecutor = {
        send: vi.fn().mockResolvedValue(okResponse())
      };

      const request = makeRequest();
      const result = await digestAuth.negotiate!(request, makeAuth(), {}, executor, undefined);

      // Should return original request unmodified (no auth header added)
      const headers = result.data.headers as Record<string, string> | undefined;
      expect(headers?.['Authorization']).toBeUndefined();
    });

    test('should throw when 401 response has no WWW-Authenticate header', async () => {
      const executor: AuthExecutor = {
        send: vi.fn().mockResolvedValue({
          data: { status: 401, headers: {}, body: '' },
          summary: { outcome: 'error', code: 401, label: 'Unauthorized', duration: 5 }
        })
      };

      await expect(
        digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined)
      ).rejects.toThrow(/no WWW-Authenticate header/);
    });

    test('should throw when WWW-Authenticate is not a Digest challenge', async () => {
      const executor: AuthExecutor = {
        send: vi.fn().mockResolvedValue({
          data: {
            status: 401,
            headers: { 'www-authenticate': 'Bearer realm="api"' },
            body: ''
          },
          summary: { outcome: 'error', code: 401, label: 'Unauthorized', duration: 5 }
        })
      };

      await expect(
        digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined)
      ).rejects.toThrow(/expected Digest challenge/);
    });

    test('should use SHA-256 algorithm when challenge specifies it', async () => {
      const executor = makeTwoRoundExecutor(
        challengeResponse401('realm', 'nonce', 'auth', 'SHA-256'),
        okResponse()
      );

      const result = await digestAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);
      const authHeader = (result.data.headers as Record<string, string>)['Authorization'];

      expect(authHeader).toContain('algorithm=SHA-256');
    });

    test('should preserve existing headers in the credentialed request', async () => {
      const executor = makeTwoRoundExecutor(
        challengeResponse401('realm', 'nonce', 'auth'),
        okResponse()
      );

      const request = makeRequest({
        data: {
          method: 'GET',
          url: 'http://example.com/protected',
          headers: { 'X-Custom': 'custom-value', 'Content-Type': 'application/json' }
        }
      });

      const result = await digestAuth.negotiate!(request, makeAuth(), {}, executor, undefined);
      const headers = result.data.headers as Record<string, string>;

      expect(headers['X-Custom']).toBe('custom-value');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toMatch(/^Digest /);
    });
  });
});
