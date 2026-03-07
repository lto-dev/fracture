// Digest Authentication (RFC 7616 / RFC 2617)
import { createHash, randomBytes } from 'crypto';
import type { IAuthPlugin, Request, Auth, RuntimeOptions, ValidationResult, ILogger, AuthExecutor } from '@apiquest/types';

interface DigestAuthData {
  username: string;
  password: string;
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  algorithm?: string;
  opaque?: string;
}

function md5(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex');
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function hash(input: string, algorithm: string): string {
  const alg = algorithm.toLowerCase().replace('-sess', '');
  if (alg === 'sha-256' || alg === 'sha256') {
    return sha256(input);
  }
  return md5(input);
}

/**
 * Parse the WWW-Authenticate: Digest header value.
 * Returns null if the header is not a Digest challenge.
 */
function parseDigestChallenge(headerValue: string): DigestChallenge | null {
  if (!headerValue.toLowerCase().startsWith('digest ')) {
    return null;
  }
  const params = headerValue.slice('digest '.length);
  const result: Record<string, string> = {};

  const pattern = /(\w+)=(?:"([^"]*?)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(params)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3];
    result[key] = value;
  }

  const realm = result['realm'];
  const nonce = result['nonce'];
  if (realm === undefined || nonce === undefined) {
    return null;
  }

  return {
    realm,
    nonce,
    qop: result['qop'],
    algorithm: result['algorithm'],
    opaque: result['opaque']
  };
}

/**
 * Compute the Digest Authorization header value.
 */
function computeDigestHeader(
  challenge: DigestChallenge,
  username: string,
  password: string,
  method: string,
  uri: string
): string {
  const algorithm = challenge.algorithm ?? 'MD5';
  const algLower = algorithm.toLowerCase();
  const isSess = algLower.includes('-sess');

  let ha1 = hash(`${username}:${challenge.realm}:${password}`, algorithm);
  if (isSess) {
    const cnonce = randomBytes(8).toString('hex');
    ha1 = hash(`${ha1}:${challenge.nonce}:${cnonce}`, algorithm);
  }

  const ha2 = hash(`${method.toUpperCase()}:${uri}`, algorithm);

  let response: string;
  let authHeader: string;

  const qopList = challenge.qop?.split(',').map(q => q.trim()) ?? [];
  const useQop = qopList.includes('auth') || qopList.includes('auth-int');

  if (useQop) {
    const cnonce = randomBytes(8).toString('hex');
    const nc = '00000001';
    const qopValue = qopList.includes('auth') ? 'auth' : 'auth-int';
    response = hash(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qopValue}:${ha2}`, algorithm);
    authHeader =
      `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", ` +
      `uri="${uri}", algorithm=${algorithm}, qop=${qopValue}, nc=${nc}, cnonce="${cnonce}", ` +
      `response="${response}"`;
    if (challenge.opaque !== undefined) {
      authHeader += `, opaque="${challenge.opaque}"`;
    }
  } else {
    // Legacy Digest without qop (RFC 2069)
    response = hash(`${ha1}:${challenge.nonce}:${ha2}`, algorithm);
    authHeader =
      `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", ` +
      `uri="${uri}", algorithm=${algorithm}, response="${response}"`;
    if (challenge.opaque !== undefined) {
      authHeader += `, opaque="${challenge.opaque}"`;
    }
  }

  return authHeader;
}

export const digestAuth: IAuthPlugin = {
  name: 'Digest Authentication',
  version: '1.0.0',
  description: 'HTTP Digest authentication with MD5/SHA-256 challenge-response (RFC 7616 / RFC 2617)',
  authTypes: ['digest'],
  protocols: ['http', 'graphql'],
  dataSchema: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: {
        type: 'string',
        description: 'Username'
      },
      password: {
        type: 'string',
        description: 'Password'
      }
    }
  },

  validate(auth: Auth, _options: RuntimeOptions): ValidationResult {
    const errors = [];
    const data = auth.data as Partial<DigestAuthData> | undefined;
    if ((data?.username ?? '') === '') {
      errors.push({
        message: 'Username is required for digest auth',
        location: '',
        source: 'auth' as const
      });
    }
    if ((data?.password ?? '') === '') {
      errors.push({
        message: 'Password is required for digest auth',
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
    const data = auth.data as unknown as DigestAuthData;
    const { username, password } = data;

    const method = (request.data.method as string | undefined) ?? 'GET';
    const url = (request.data.url as string | undefined) ?? '';

    // Extract URI path from the URL for the Digest uri= field
    let uri: string;
    try {
      const parsed = new URL(url);
      uri = parsed.pathname + (parsed.search !== '' ? parsed.search : '');
    } catch {
      uri = url;
    }

    // Round 1: probe for the challenge — send request without auth headers
    logger?.debug('Digest auth round 1: probing for challenge');
    const probeRequest = { ...request, data: { ...request.data } };
    const challengeResponse = await executor.send(probeRequest);

    const responseData = challengeResponse.data as {
      status?: number;
      headers?: Record<string, string | string[]>;
    } | undefined;

    if ((responseData?.status ?? 0) !== 401) {
      // Server did not challenge — return the original request unmodified
      // (server accepted without auth or returned a different error)
      logger?.debug(`Digest auth: server did not respond with 401 (got ${responseData?.status ?? 'unknown'}), skipping auth`);
      return request;
    }

    // Extract WWW-Authenticate header (case-insensitive)
    const headers = responseData?.headers ?? {};
    let wwwAuthenticate: string | undefined;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'www-authenticate') {
        wwwAuthenticate = Array.isArray(value) ? value[0] : value;
        break;
      }
    }

    if (wwwAuthenticate === undefined) {
      throw new Error('Digest auth: server returned 401 but no WWW-Authenticate header');
    }

    const challenge = parseDigestChallenge(wwwAuthenticate);
    if (challenge === null) {
      throw new Error(`Digest auth: expected Digest challenge, got: ${wwwAuthenticate}`);
    }

    logger?.debug(`Digest auth challenge received: realm="${challenge.realm}", nonce="${challenge.nonce}", qop="${challenge.qop ?? 'none'}"`);

    // Compute credentials and build Authorization header
    const authorizationHeader = computeDigestHeader(challenge, username, password, method, uri);

    // Round 2: send request with credentials
    logger?.debug('Digest auth round 2: sending credentials');
    const credentialedRequest: Request = {
      ...request,
      data: {
        ...request.data,
        headers: {
          ...(request.data.headers as Record<string, string> | undefined ?? {}),
          Authorization: authorizationHeader
        }
      }
    };

    await executor.send(credentialedRequest);

    // Return the credentialed request so PluginManager uses it for the official execute call
    return credentialedRequest;
  }
};
