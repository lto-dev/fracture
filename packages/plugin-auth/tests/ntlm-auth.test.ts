import { describe, test, expect, vi } from 'vitest';
import { ntlmAuth } from '../src/index.js';
import type { Request, Auth, AuthExecutor, ProtocolResponse } from '@apiquest/types';

// ============================================================================
// Test helpers
// ============================================================================

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    type: 'request',
    id: 'req-ntlm',
    name: 'NTLM Test Request',
    data: {
      method: 'GET',
      url: 'http://example.com/protected'
    },
    ...overrides
  };
}

function makeAuth(data: Record<string, string> = {}): Auth {
  return {
    type: 'ntlm',
    data: {
      username: 'testuser',
      password: 'testpass',
      domain: 'TESTDOMAIN',
      ...data
    }
  };
}

/**
 * Build a minimal but structurally valid NTLM Type 2 message.
 * Fields: signature (8), type (4), target name sb (8), flags (4), challenge (8), reserved (8), target info sb (8), payload
 */
function buildType2Token(serverChallenge: Buffer): string {
  const signature = Buffer.from('NTLMSSP\x00', 'ascii'); // 8 bytes
  const type = Buffer.allocUnsafe(4);
  type.writeUInt32LE(2);

  // Target name security buffer (length=0, offset=56)
  const targetNameSb = Buffer.allocUnsafe(8);
  targetNameSb.writeUInt16LE(0, 0);
  targetNameSb.writeUInt16LE(0, 2);
  targetNameSb.writeUInt32LE(56, 4);

  const flags = Buffer.allocUnsafe(4);
  flags.writeUInt32LE(0x00000001 | 0x00000200); // UNICODE + NTLM

  // Server challenge: 8 bytes at offset 24
  // Reserved: 8 bytes at offset 32

  const reserved = Buffer.alloc(8);

  // Target info security buffer (length=0, offset=56)
  const targetInfoSb = Buffer.allocUnsafe(8);
  targetInfoSb.writeUInt16LE(0, 0);
  targetInfoSb.writeUInt16LE(0, 2);
  targetInfoSb.writeUInt32LE(56, 4);

  const message = Buffer.concat([
    signature,   // 0-7
    type,        // 8-11
    targetNameSb, // 12-19
    flags,       // 20-23 — NOTE: actual offset of challenge is 24
    serverChallenge, // 24-31
    reserved,    // 32-39
    targetInfoSb, // 40-47
  ]);

  return message.toString('base64');
}

function type2ChallengeResponse(challengeToken: string): ProtocolResponse {
  return {
    data: {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'www-authenticate': `NTLM ${challengeToken}` },
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
      body: 'authenticated content'
    },
    summary: { outcome: 'success', code: 200, label: 'OK', duration: 10 }
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('NTLM Auth Plugin', () => {
  describe('Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(ntlmAuth.name).toBe('NTLM Authentication');
      expect(ntlmAuth.version).toBe('1.0.0');
      expect(ntlmAuth.authTypes).toContain('ntlm');
    });

    test('should support http protocol', () => {
      expect(ntlmAuth.protocols).toContain('http');
    });

    test('should have dataSchema with username and password', () => {
      const schema = ntlmAuth.dataSchema as { properties: Record<string, unknown> };
      expect(schema.properties['username']).toBeDefined();
      expect(schema.properties['password']).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation with username and password', () => {
      const result = ntlmAuth.validate(makeAuth(), {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation without username', () => {
      const result = ntlmAuth.validate(makeAuth({ username: '' }), {});
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.toLowerCase().includes('username'))).toBe(true);
    });

    test('should fail validation without password', () => {
      const result = ntlmAuth.validate(makeAuth({ password: '' }), {});
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.toLowerCase().includes('password'))).toBe(true);
    });

    test('should pass validation without optional domain and workstation', () => {
      const auth: Auth = {
        type: 'ntlm',
        data: { username: 'user', password: 'pass' }
      };
      const result = ntlmAuth.validate(auth, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('negotiate() — three-round exchange', () => {
    test('should call executor three times (Type1, Type2 challenge, Type3)', async () => {
      const serverChallenge = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      const type2Token = buildType2Token(serverChallenge);

      const sendSpy = vi.fn()
        .mockResolvedValueOnce(type2ChallengeResponse(type2Token))
        .mockResolvedValueOnce(okResponse());

      const executor: AuthExecutor = { send: sendSpy };
      await ntlmAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);

      // Round 1: Type1 Negotiate
      // Round 2: (server -> client Type2, implicit)
      // Round 3: Type3 Authenticate
      // executor.send is called for rounds 1 and 3 only
      expect(sendSpy).toHaveBeenCalledTimes(2);
    });

    test('round 1 request should have Authorization: NTLM <Type1 base64>', async () => {
      const serverChallenge = Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
      const type2Token = buildType2Token(serverChallenge);

      const sendSpy = vi.fn()
        .mockResolvedValueOnce(type2ChallengeResponse(type2Token))
        .mockResolvedValueOnce(okResponse());

      const executor: AuthExecutor = { send: sendSpy };
      await ntlmAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);

      const round1Request = sendSpy.mock.calls[0][0] as Request;
      const authHeader = (round1Request.data.headers as Record<string, string>)['Authorization'];
      expect(authHeader).toMatch(/^NTLM [A-Za-z0-9+/=]+$/);

      // Decode Type1 and verify it contains the NTLMSSP signature
      const token = authHeader.replace('NTLM ', '');
      const decoded = Buffer.from(token, 'base64');
      expect(decoded.subarray(0, 7).toString('ascii')).toBe('NTLMSSP');
    });

    test('round 3 request should have Authorization: NTLM <Type3 base64>', async () => {
      const serverChallenge = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11]);
      const type2Token = buildType2Token(serverChallenge);

      const sendSpy = vi.fn()
        .mockResolvedValueOnce(type2ChallengeResponse(type2Token))
        .mockResolvedValueOnce(okResponse());

      const executor: AuthExecutor = { send: sendSpy };
      await ntlmAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);

      const round3Request = sendSpy.mock.calls[1][0] as Request;
      const authHeader = (round3Request.data.headers as Record<string, string>)['Authorization'];
      expect(authHeader).toMatch(/^NTLM [A-Za-z0-9+/=]+$/);

      // Decode Type3 and verify NTLMSSP signature
      const token = authHeader.replace('NTLM ', '');
      const decoded = Buffer.from(token, 'base64');
      expect(decoded.subarray(0, 7).toString('ascii')).toBe('NTLMSSP');

      // Type3 message type is 3
      expect(decoded.readUInt32LE(8)).toBe(3);
    });

    test('should return credentialed request (with Authorization header) after round 3', async () => {
      const serverChallenge = Buffer.alloc(8, 0x42);
      const type2Token = buildType2Token(serverChallenge);

      const executor: AuthExecutor = {
        send: vi.fn()
          .mockResolvedValueOnce(type2ChallengeResponse(type2Token))
          .mockResolvedValueOnce(okResponse())
      };

      const result = await ntlmAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);

      const headers = result.data.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^NTLM /);

      // The returned request should have Type3
      const token = headers['Authorization'].replace('NTLM ', '');
      const decoded = Buffer.from(token, 'base64');
      expect(decoded.readUInt32LE(8)).toBe(3);
    });

    test('should throw when 401 response has no WWW-Authenticate header', async () => {
      const executor: AuthExecutor = {
        send: vi.fn().mockResolvedValue({
          data: { status: 401, headers: {}, body: '' },
          summary: { outcome: 'error', code: 401, label: 'Unauthorized', duration: 5 }
        })
      };

      await expect(
        ntlmAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined)
      ).rejects.toThrow(/no WWW-Authenticate header/);
    });

    test('should throw when WWW-Authenticate is not an NTLM challenge', async () => {
      const executor: AuthExecutor = {
        send: vi.fn().mockResolvedValue({
          data: {
            status: 401,
            headers: { 'www-authenticate': 'Digest realm="api"' },
            body: ''
          },
          summary: { outcome: 'error', code: 401, label: 'Unauthorized', duration: 5 }
        })
      };

      await expect(
        ntlmAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined)
      ).rejects.toThrow(/expected NTLM challenge/);
    });

    test('should preserve existing headers in the credentialed request', async () => {
      const serverChallenge = Buffer.alloc(8, 0x11);
      const type2Token = buildType2Token(serverChallenge);

      const executor: AuthExecutor = {
        send: vi.fn()
          .mockResolvedValueOnce(type2ChallengeResponse(type2Token))
          .mockResolvedValueOnce(okResponse())
      };

      const request = makeRequest({
        data: {
          method: 'GET',
          url: 'http://example.com/protected',
          headers: { 'Accept': 'application/json', 'X-Request-ID': 'abc123' }
        }
      });

      const result = await ntlmAuth.negotiate!(request, makeAuth(), {}, executor, undefined);
      const headers = result.data.headers as Record<string, string>;

      expect(headers['Accept']).toBe('application/json');
      expect(headers['X-Request-ID']).toBe('abc123');
      expect(headers['Authorization']).toMatch(/^NTLM /);
    });

    test('should handle unexpected non-401 after Type1 gracefully', async () => {
      const executor: AuthExecutor = {
        send: vi.fn().mockResolvedValue(okResponse())
      };

      // Server accepts without challenge — plugin returns the Type1 request
      const result = await ntlmAuth.negotiate!(makeRequest(), makeAuth(), {}, executor, undefined);

      const headers = result.data.headers as Record<string, string>;
      // Type1 request should have been returned — it has an Authorization header
      expect(headers['Authorization']).toMatch(/^NTLM /);
    });
  });
});
