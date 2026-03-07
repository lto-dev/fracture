// NTLM Authentication
// Implements NTLMv2 using HMAC-MD5.
// NTHash (the per-user credential used in NTLM) requires MD4. Since OpenSSL 3.0
// disabled MD4 by default, we include an inline pure-JS MD4 implementation
// (BSD License, adapted from Paul Johnston 1999–2002 / RSA Data Security RFC 1320).
// Everything else (HMAC-MD5, blob construction) uses Node.js built-in crypto.
import { createHmac, randomBytes } from 'crypto';
import type { IAuthPlugin, Request, Auth, RuntimeOptions, ValidationResult, ILogger, AuthExecutor } from '@apiquest/types';

interface NtlmAuthData {
  username: string;
  password: string;
  domain?: string;
  workstation?: string;
}

// ============================================================================
// NTLM constants
// ============================================================================

// NTLM negotiate flags used in Type 1 and Type 3 messages
const NTLM_FLAGS = {
  NTLM_NEGOTIATE: 0x00000001,
  OEM: 0x00000002,
  UNICODE: 0x00000001,
  REQUEST_TARGET: 0x00000004,
  NTLM: 0x00000200,
  ALWAYS_SIGN: 0x00008000,
  NTLM2_KEY: 0x00080000,
  TARGET_INFO: 0x00800000,
  VERSION: 0x02000000,
  NTLMv2: 0x20000000
};

const NEGOTIATE_FLAGS =
  NTLM_FLAGS.UNICODE |
  NTLM_FLAGS.REQUEST_TARGET |
  NTLM_FLAGS.NTLM |
  NTLM_FLAGS.ALWAYS_SIGN |
  NTLM_FLAGS.NTLM2_KEY;

// ============================================================================
// String encoding helpers
// ============================================================================

/** Encode a string as UTF-16LE bytes */
function encodeUtf16Le(str: string): Buffer {
  const buf = Buffer.allocUnsafe(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    buf.writeUInt16LE(str.charCodeAt(i), i * 2);
  }
  return buf;
}

// ============================================================================
// NTLMv2 credential computation
// ============================================================================

// ============================================================================
// Pure-JS MD4 (RFC 1320)
// Adapted from Paul Johnston 1999-2002 (BSD License).
// Operates on 32-bit little-endian word arrays matching RFC 1320 byte order.
// ============================================================================

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

function rol32(n: number, s: number): number {
  return (n << s) | (n >>> (32 - s));
}

function md4F(a: number, b: number, c: number, d: number, x: number, s: number): number {
  return safeAdd(rol32(safeAdd(safeAdd(a, (b & c) | (~b & d)), x), s), 0);
}

function md4G(a: number, b: number, c: number, d: number, x: number, s: number): number {
  return safeAdd(rol32(safeAdd(safeAdd(a, (b & c) | (b & d) | (c & d)), safeAdd(x, 0x5a827999)), s), 0);
}

function md4H(a: number, b: number, c: number, d: number, x: number, s: number): number {
  return safeAdd(rol32(safeAdd(safeAdd(a, b ^ c ^ d), safeAdd(x, 0x6ed9eba1)), s), 0);
}

/**
 * Compute MD4 hash of an arbitrary Buffer. Returns a 16-byte Buffer.
 * Exported for testing against RFC 1320 test vectors.
 */
export function md4(input: Buffer): Buffer {
  const len = input.length;
  // Convert to 32-bit LE word array, pad to 512-bit boundary
  const numWords = ((len + 72) >>> 6) << 4;
  const words: number[] = Array(numWords).fill(0) as number[];

  for (let i = 0; i < len; i++) {
    words[i >> 2] |= input[i] << ((i & 3) << 3);
  }
  words[len >> 2] |= 0x80 << ((len & 3) << 3);
  words[numWords - 2] = (len << 3) >>> 0;
  words[numWords - 1] = (len >>> 29) >>> 0;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let i = 0; i < words.length; i += 16) {
    const X = words.slice(i, i + 16);
    const [aa, bb, cc, dd] = [a, b, c, d];

    a = md4F(a,b,c,d,X[0],3);  d = md4F(d,a,b,c,X[1],7);  c = md4F(c,d,a,b,X[2],11); b = md4F(b,c,d,a,X[3],19);
    a = md4F(a,b,c,d,X[4],3);  d = md4F(d,a,b,c,X[5],7);  c = md4F(c,d,a,b,X[6],11); b = md4F(b,c,d,a,X[7],19);
    a = md4F(a,b,c,d,X[8],3);  d = md4F(d,a,b,c,X[9],7);  c = md4F(c,d,a,b,X[10],11);b = md4F(b,c,d,a,X[11],19);
    a = md4F(a,b,c,d,X[12],3); d = md4F(d,a,b,c,X[13],7); c = md4F(c,d,a,b,X[14],11);b = md4F(b,c,d,a,X[15],19);

    a = md4G(a,b,c,d,X[0],3);  d = md4G(d,a,b,c,X[4],5);  c = md4G(c,d,a,b,X[8],9);  b = md4G(b,c,d,a,X[12],13);
    a = md4G(a,b,c,d,X[1],3);  d = md4G(d,a,b,c,X[5],5);  c = md4G(c,d,a,b,X[9],9);  b = md4G(b,c,d,a,X[13],13);
    a = md4G(a,b,c,d,X[2],3);  d = md4G(d,a,b,c,X[6],5);  c = md4G(c,d,a,b,X[10],9); b = md4G(b,c,d,a,X[14],13);
    a = md4G(a,b,c,d,X[3],3);  d = md4G(d,a,b,c,X[7],5);  c = md4G(c,d,a,b,X[11],9); b = md4G(b,c,d,a,X[15],13);

    a = md4H(a,b,c,d,X[0],3);  d = md4H(d,a,b,c,X[8],9);  c = md4H(c,d,a,b,X[4],11); b = md4H(b,c,d,a,X[12],15);
    a = md4H(a,b,c,d,X[2],3);  d = md4H(d,a,b,c,X[10],9); c = md4H(c,d,a,b,X[6],11); b = md4H(b,c,d,a,X[14],15);
    a = md4H(a,b,c,d,X[1],3);  d = md4H(d,a,b,c,X[9],9);  c = md4H(c,d,a,b,X[5],11); b = md4H(b,c,d,a,X[13],15);
    a = md4H(a,b,c,d,X[3],3);  d = md4H(d,a,b,c,X[11],9); c = md4H(c,d,a,b,X[7],11); b = md4H(b,c,d,a,X[15],15);

    a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
  }

  const result = Buffer.allocUnsafe(16);
  result.writeInt32LE(a, 0);
  result.writeInt32LE(b, 4);
  result.writeInt32LE(c, 8);
  result.writeInt32LE(d, 12);
  return result;
}

/** Compute NTHash = MD4(UTF-16LE(password)) — correct for all OpenSSL versions */
function computeNtHash(password: string): Buffer {
  return md4(encodeUtf16Le(password));
}

/** Compute NTLMv2 hash = HMAC-MD5(NTHash, UTF-16LE(uppercase(username) + domain)) */
function computeNtlmV2Hash(ntHash: Buffer, username: string, domain: string): Buffer {
  const identity = encodeUtf16Le(username.toUpperCase() + domain);
  return createHmac('md5', ntHash).update(identity).digest();
}

/** Build the NTLMv2 blob (client challenge structure) */
function buildNtlmV2Blob(clientChallenge: Buffer, targetInfo: Buffer): Buffer {
  const timestamp = BigInt(Date.now()) * BigInt(10000) + BigInt('116444736000000000');
  const timestampBuf = Buffer.allocUnsafe(8);
  timestampBuf.writeBigUInt64LE(timestamp);

  const header = Buffer.from([0x01, 0x01, 0x00, 0x00]); // blob signature
  const reserved1 = Buffer.alloc(4);
  const reserved2 = Buffer.alloc(4);

  return Buffer.concat([header, reserved1, timestampBuf, clientChallenge, reserved2, targetInfo]);
}

/** Compute NTProofStr = HMAC-MD5(ntlmV2Hash, serverChallenge || blob) */
function computeNtProofStr(ntlmV2Hash: Buffer, serverChallenge: Buffer, blob: Buffer): Buffer {
  const hmac = createHmac('md5', ntlmV2Hash);
  hmac.update(serverChallenge);
  hmac.update(blob);
  return hmac.digest();
}

/** Build NTLMv2 response = NTProofStr || blob */
function buildNtlmV2Response(
  username: string,
  password: string,
  domain: string,
  serverChallenge: Buffer,
  targetInfo: Buffer
): Buffer {
  const clientChallenge = randomBytes(8);
  const ntHash = computeNtHash(password);
  const ntlmV2Hash = computeNtlmV2Hash(ntHash, username, domain);
  const blob = buildNtlmV2Blob(clientChallenge, targetInfo);
  const ntProofStr = computeNtProofStr(ntlmV2Hash, serverChallenge, blob);
  return Buffer.concat([ntProofStr, blob]);
}

// ============================================================================
// NTLM message encoding
// ============================================================================

interface SecurityBuffer {
  length: number;
  maxLength: number;
  offset: number;
}

function writeSecurityBuffer(buf: Buffer, offset: number, sb: SecurityBuffer): void {
  buf.writeUInt16LE(sb.length, offset);
  buf.writeUInt16LE(sb.maxLength, offset + 2);
  buf.writeUInt32LE(sb.offset, offset + 4);
}

/** Build NTLM Type 1 Negotiate message */
function buildType1Message(domain: string, workstation: string): Buffer {
  const signature = Buffer.from('NTLMSSP\x00', 'ascii');
  const type = Buffer.allocUnsafe(4);
  type.writeUInt32LE(1); // Type 1

  const flags = Buffer.allocUnsafe(4);
  flags.writeUInt32LE(NEGOTIATE_FLAGS);

  // Security buffers for domain and workstation (can be empty in Type 1)
  const domainBuf = encodeUtf16Le(domain);
  const workstationBuf = encodeUtf16Le(workstation);

  const fixedPartLen = 8 + 4 + 4 + 8 + 8; // sig + type + flags + domain sb + workstation sb
  const domainOffset = fixedPartLen;
  const workstationOffset = domainOffset + domainBuf.length;

  const message = Buffer.allocUnsafe(fixedPartLen + domainBuf.length + workstationBuf.length);
  signature.copy(message, 0);
  type.copy(message, 8);
  flags.copy(message, 12);

  const domainSb: SecurityBuffer = { length: domainBuf.length, maxLength: domainBuf.length, offset: domainOffset };
  const workstationSb: SecurityBuffer = { length: workstationBuf.length, maxLength: workstationBuf.length, offset: workstationOffset };

  writeSecurityBuffer(message, 16, domainSb);
  writeSecurityBuffer(message, 24, workstationSb);
  domainBuf.copy(message, domainOffset);
  workstationBuf.copy(message, workstationOffset);

  return message;
}

/** Parse NTLM Type 2 Challenge message. Returns server challenge and target info. */
function parseType2Message(token: string): { serverChallenge: Buffer; targetInfo: Buffer } {
  const buf = Buffer.from(token, 'base64');

  // Validate signature "NTLMSSP\0"
  const sig = buf.subarray(0, 8).toString('ascii');
  if (sig !== 'NTLMSSP\x00') {
    // Tolerant parsing — return empty buffers so the flow continues
    return { serverChallenge: randomBytes(8), targetInfo: Buffer.alloc(0) };
  }

  // Server challenge is at offset 24, length 8
  const serverChallenge = buf.subarray(24, 32);

  // Target info security buffer at offset 40
  const targetInfoLen = buf.readUInt16LE(40);
  const targetInfoOffset = buf.readUInt32LE(44);
  const targetInfo = buf.subarray(targetInfoOffset, targetInfoOffset + targetInfoLen);

  return { serverChallenge, targetInfo };
}

/** Build NTLM Type 3 Authenticate message */
function buildType3Message(
  username: string,
  password: string,
  domain: string,
  workstation: string,
  serverChallenge: Buffer,
  targetInfo: Buffer
): Buffer {
  const ntlmResponse = buildNtlmV2Response(username, password, domain, serverChallenge, targetInfo);
  const lmResponse = Buffer.alloc(24, 0); // LM response — send zeroes for NTLMv2

  const domainBuf = encodeUtf16Le(domain);
  const usernameBuf = encodeUtf16Le(username);
  const workstationBuf = encodeUtf16Le(workstation);

  const fixedLen = 8 + 4 + 8 + 8 + 8 + 8 + 8 + 4; // sig+type+lm+ntlm+domain+user+workstation+flags
  const lmOffset = fixedLen;
  const ntlmOffset = lmOffset + lmResponse.length;
  const domainOffset = ntlmOffset + ntlmResponse.length;
  const usernameOffset = domainOffset + domainBuf.length;
  const workstationOffset = usernameOffset + usernameBuf.length;

  const totalLen = workstationOffset + workstationBuf.length;
  const message = Buffer.allocUnsafe(totalLen);

  Buffer.from('NTLMSSP\x00', 'ascii').copy(message, 0);
  message.writeUInt32LE(3, 8); // Type 3

  const lmSb: SecurityBuffer = { length: lmResponse.length, maxLength: lmResponse.length, offset: lmOffset };
  const ntlmSb: SecurityBuffer = { length: ntlmResponse.length, maxLength: ntlmResponse.length, offset: ntlmOffset };
  const domainSb: SecurityBuffer = { length: domainBuf.length, maxLength: domainBuf.length, offset: domainOffset };
  const userSb: SecurityBuffer = { length: usernameBuf.length, maxLength: usernameBuf.length, offset: usernameOffset };
  const workSb: SecurityBuffer = { length: workstationBuf.length, maxLength: workstationBuf.length, offset: workstationOffset };

  writeSecurityBuffer(message, 12, lmSb);
  writeSecurityBuffer(message, 20, ntlmSb);
  writeSecurityBuffer(message, 28, domainSb);
  writeSecurityBuffer(message, 36, userSb);
  writeSecurityBuffer(message, 44, workSb);
  message.writeUInt32LE(NEGOTIATE_FLAGS, 60);

  lmResponse.copy(message, lmOffset);
  ntlmResponse.copy(message, ntlmOffset);
  domainBuf.copy(message, domainOffset);
  usernameBuf.copy(message, usernameOffset);
  workstationBuf.copy(message, workstationOffset);

  return message;
}

// ============================================================================
// WWW-Authenticate header parsing
// ============================================================================

function extractNtlmToken(headerValue: string): string | null {
  const trimmed = headerValue.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'ntlm') {
    return '';
  }
  if (!lower.startsWith('ntlm ')) {
    return null;
  }
  return trimmed.slice(5).trim();
}

// ============================================================================
// Plugin export
// ============================================================================

export const ntlmAuth: IAuthPlugin = {
  name: 'NTLM Authentication',
  version: '1.0.0',
  description: 'NTLM Windows challenge-response authentication using NTLMv2 (HMAC-MD5)',
  authTypes: ['ntlm'],
  protocols: ['http'],
  dataSchema: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: {
        type: 'string',
        description: 'Windows username'
      },
      password: {
        type: 'string',
        description: 'Windows password'
      },
      domain: {
        type: 'string',
        description: 'Windows domain (optional)'
      },
      workstation: {
        type: 'string',
        description: 'Workstation name (optional)'
      }
    }
  },

  validate(auth: Auth, _options: RuntimeOptions): ValidationResult {
    const errors = [];
    const data = auth.data as Partial<NtlmAuthData> | undefined;
    if ((data?.username ?? '') === '') {
      errors.push({
        message: 'Username is required for NTLM auth',
        location: '',
        source: 'auth' as const
      });
    }
    if ((data?.password ?? '') === '') {
      errors.push({
        message: 'Password is required for NTLM auth',
        location: '',
        source: 'auth' as const
      });
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  },

  async negotiate(
    request: Request,
    auth: Auth,
    _options: RuntimeOptions,
    executor: AuthExecutor,
    logger?: ILogger
  ): Promise<Request> {
    const data = auth.data as unknown as NtlmAuthData;
    const { username, password } = data;
    const domain = data.domain ?? '';
    const workstation = data.workstation ?? '';

    // Round 1: send Type 1 Negotiate message
    const type1Buf = buildType1Message(domain, workstation);
    const type1Token = type1Buf.toString('base64');
    logger?.debug('NTLM auth round 1: sending Type1 Negotiate message');

    const round1Request: Request = {
      ...request,
      data: {
        ...request.data,
        headers: {
          ...(request.data.headers as Record<string, string> | undefined ?? {}),
          Authorization: `NTLM ${type1Token}`
        }
      }
    };

    const challengeResponse = await executor.send(round1Request);

    const responseData = challengeResponse.data as {
      status?: number;
      headers?: Record<string, string | string[]>;
    } | undefined;

    if ((responseData?.status ?? 0) !== 401) {
      logger?.debug(`NTLM auth: unexpected status after Type1 (got ${responseData?.status ?? 'unknown'})`);
      return round1Request;
    }

    // Extract WWW-Authenticate: NTLM <Type2 base64>
    const respHeaders = responseData?.headers ?? {};
    let wwwAuthenticate: string | undefined;
    for (const [key, value] of Object.entries(respHeaders)) {
      if (key.toLowerCase() === 'www-authenticate') {
        wwwAuthenticate = Array.isArray(value) ? value[0] : value;
        break;
      }
    }

    if (wwwAuthenticate === undefined) {
      throw new Error('NTLM auth: server returned 401 but no WWW-Authenticate header');
    }

    const type2Token = extractNtlmToken(wwwAuthenticate);
    if (type2Token === null) {
      throw new Error(`NTLM auth: expected NTLM challenge, got: ${wwwAuthenticate}`);
    }

    logger?.debug(`NTLM auth: received Type2 challenge (token length=${type2Token.length})`);

    // Parse Type 2 to extract server challenge and target info
    const { serverChallenge, targetInfo } = parseType2Message(type2Token);

    // Round 3: compute and send Type 3 Authenticate message
    const type3Buf = buildType3Message(username, password, domain, workstation, serverChallenge, targetInfo);
    const type3Token = type3Buf.toString('base64');
    logger?.debug('NTLM auth round 3: sending Type3 Authenticate message');

    const credentialedRequest: Request = {
      ...request,
      data: {
        ...request.data,
        headers: {
          ...(request.data.headers as Record<string, string> | undefined ?? {}),
          Authorization: `NTLM ${type3Token}`
        }
      }
    };

    await executor.send(credentialedRequest);

    return credentialedRequest;
  }
};
