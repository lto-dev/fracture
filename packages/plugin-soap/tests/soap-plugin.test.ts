import { describe, test, expect, afterAll, beforeAll } from 'vitest';
import { soapPlugin } from '../src/index.js';
import type { Request, ExecutionContext, RuntimeOptions, ICookieJar, CookieSetOptions, ProtocolResponse } from '@apiquest/types';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to extract typed response data
function getResponseData(response: ProtocolResponse): {
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string | string[]>;
  parsed: unknown;
  fault: { hasFault: boolean; code?: string; reason?: string; detail?: string };
} {
  return response.data as {
    status: number;
    statusText: string;
    body: string;
    headers: Record<string, string | string[]>;
    parsed: unknown;
    fault: { hasFault: boolean; code?: string; reason?: string; detail?: string };
  };
}

// Minimal cookie jar for testing
class TestCookieJar implements ICookieJar {
  private cookies: Map<string, string> = new Map();

  get(name: string, _domain?: string, _path?: string): string | null {
    return this.cookies.get(name) ?? null;
  }
  set(name: string, value: string, _options: CookieSetOptions): void {
    this.cookies.set(name, value);
  }
  has(name: string, _domain?: string, _path?: string): boolean {
    return this.cookies.has(name);
  }
  remove(name: string, _domain?: string, _path?: string): void {
    this.cookies.delete(name);
  }
  clear(): void {
    this.cookies.clear();
  }
  toObject(): Record<string, string> {
    return Object.fromEntries(this.cookies.entries());
  }
  getCookieHeader(_url: string): string | null {
    if (this.cookies.size === 0) return null;
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(_cookies: string | string[] | null | undefined, _url: string): void {
    // noop for test purposes
  }
}

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    currentRequest: null,
    currentResponse: null,
    cookieJar: new TestCookieJar(),
    abortSignal: null,
    variables: { get: () => null, set: () => {}, has: () => false, getAll: () => ({}) },
    ...overrides
  } as unknown as ExecutionContext;
}

function makeOptions(overrides?: Partial<RuntimeOptions>): RuntimeOptions {
  return {
    timeout: { request: 5000 },
    ssl: { validateCertificates: false },
    followRedirects: true,
    ...overrides
  } as RuntimeOptions;
}

function makeRequest(data: Record<string, unknown>): Request {
  return {
    id: 'test-request',
    type: 'request',
    name: 'Test SOAP Request',
    data: { ...data }
  } as unknown as Request;
}

// ============================================================================
// Plugin Identity
// ============================================================================

describe('soapPlugin — identity', () => {
  test('has correct name', () => {
    expect(soapPlugin.name).toBe('SOAP Client');
  });

  test('provides soap protocol', () => {
    expect(soapPlugin.protocols).toContain('soap');
  });

  test('supports expected auth types', () => {
    expect(soapPlugin.supportedAuthTypes).toEqual(expect.arrayContaining(['bearer', 'basic', 'oauth2', 'apikey']));
  });

  test('strictAuthList is false', () => {
    expect(soapPlugin.strictAuthList).toBe(false);
  });

  test('has dataSchema', () => {
    expect(soapPlugin.dataSchema).toBeDefined();
  });

  test('has optionsSchema', () => {
    expect(soapPlugin.optionsSchema).toBeDefined();
    expect(soapPlugin.optionsSchema?.timeout).toBeDefined();
    expect(soapPlugin.optionsSchema?.validateCertificates).toBeDefined();
    expect(soapPlugin.optionsSchema?.wsdlCache).toBeDefined();
  });
});

// ============================================================================
// Validation — validate()
// ============================================================================

describe('soapPlugin — validate()', () => {
  test('requires url', () => {
    const request = makeRequest({ body: { mode: 'raw', raw: '<soap:Envelope/>' } });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'url')).toBe(true);
  });

  test('rejects empty url', () => {
    const request = makeRequest({ url: '   ' });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
  });

  test('accepts valid url with no body', () => {
    const request = makeRequest({ url: 'https://service.example.com/soap' });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(true);
  });

  test('rejects invalid soapVersion', () => {
    const request = makeRequest({ url: 'https://service.example.com', soapVersion: '1.0' });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'soapVersion')).toBe(true);
  });

  test('accepts soapVersion 1.1', () => {
    const request = makeRequest({ url: 'https://service.example.com', soapVersion: '1.1' });
    expect(soapPlugin.validate(request, makeOptions()).valid).toBe(true);
  });

  test('accepts soapVersion 1.2', () => {
    const request = makeRequest({ url: 'https://service.example.com', soapVersion: '1.2' });
    expect(soapPlugin.validate(request, makeOptions()).valid).toBe(true);
  });

  test('rejects invalid body mode', () => {
    const request = makeRequest({ url: 'https://service.example.com', body: { mode: 'json' } });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'body.mode')).toBe(true);
  });

  test('raw mode requires body.raw', () => {
    const request = makeRequest({ url: 'https://service.example.com', body: { mode: 'raw' } });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'body.raw')).toBe(true);
  });

  test('raw mode accepts non-empty body.raw', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      body: { mode: 'raw', raw: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body/></soap:Envelope>' }
    });
    expect(soapPlugin.validate(request, makeOptions()).valid).toBe(true);
  });

  test('operation mode requires wsdl', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      service: 'WeatherService', port: 'WeatherPort', operation: 'GetWeather',
      body: { mode: 'operation', args: {} }
    });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'wsdl')).toBe(true);
  });

  test('operation mode requires service', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      wsdl: 'https://service.example.com?wsdl',
      port: 'WeatherPort', operation: 'GetWeather',
      body: { mode: 'operation', args: {} }
    });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'service')).toBe(true);
  });

  test('operation mode requires port', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      wsdl: 'https://service.example.com?wsdl',
      service: 'WeatherService', operation: 'GetWeather',
      body: { mode: 'operation', args: {} }
    });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'port')).toBe(true);
  });

  test('operation mode requires operation name', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      wsdl: 'https://service.example.com?wsdl',
      service: 'WeatherService', port: 'WeatherPort',
      body: { mode: 'operation', args: {} }
    });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'operation')).toBe(true);
  });

  test('operation mode valid when all required fields present', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      wsdl: 'https://service.example.com?wsdl',
      service: 'WeatherService', port: 'WeatherPort', operation: 'GetWeather',
      body: { mode: 'operation', args: { CityName: 'London' } }
    });
    expect(soapPlugin.validate(request, makeOptions()).valid).toBe(true);
  });

  test('security mode usernameToken requires username and password', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      security: { mode: 'usernameToken' }
    });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'security.username')).toBe(true);
    expect(result.errors?.some(e => e.location === 'security.password')).toBe(true);
  });

  test('security mode x509 requires cert and key', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      security: { mode: 'x509' }
    });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'security.cert')).toBe(true);
    expect(result.errors?.some(e => e.location === 'security.key')).toBe(true);
  });

  test('security mode none is valid', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      security: { mode: 'none' }
    });
    expect(soapPlugin.validate(request, makeOptions()).valid).toBe(true);
  });

  test('rejects invalid security mode', () => {
    const request = makeRequest({
      url: 'https://service.example.com',
      security: { mode: 'kerberos' }
    });
    const result = soapPlugin.validate(request, makeOptions());
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.location === 'security.mode')).toBe(true);
  });
});

// ============================================================================
// Protocol API Provider — protocolAPIProvider()
// ============================================================================

describe('soapPlugin — protocolAPIProvider()', () => {
  test('returns request.url from currentRequest.data.url', () => {
    const context = makeContext({
      currentRequest: makeRequest({ url: 'https://service.example.com/soap' }) as unknown as ExecutionContext['currentRequest']
    });
    const api = soapPlugin.protocolAPIProvider(context);
    expect((api as { request: { url: string } }).request.url).toBe('https://service.example.com/soap');
  });

  test('request.soap.version reflects soapVersion field', () => {
    const context = makeContext({
      currentRequest: makeRequest({ url: 'https://service.example.com', soapVersion: '1.2' }) as unknown as ExecutionContext['currentRequest']
    });
    const api = soapPlugin.protocolAPIProvider(context) as { request: { soap: { version: string | null } } };
    expect(api.request.soap.version).toBe('1.2');
  });

  test('request.soap.action reflects soapAction field', () => {
    const context = makeContext({
      currentRequest: makeRequest({ url: 'https://service.example.com', soapAction: 'http://example.com/GetData' }) as unknown as ExecutionContext['currentRequest']
    });
    const api = soapPlugin.protocolAPIProvider(context) as { request: { soap: { action: string | null } } };
    expect(api.request.soap.action).toBe('http://example.com/GetData');
  });

  test('request.soap.operation reflects operation field', () => {
    const context = makeContext({
      currentRequest: makeRequest({ url: 'https://service.example.com', operation: 'GetWeather' }) as unknown as ExecutionContext['currentRequest']
    });
    const api = soapPlugin.protocolAPIProvider(context) as { request: { soap: { operation: string | null } } };
    expect(api.request.soap.operation).toBe('GetWeather');
  });

  test('request.soap.envelope.get() returns raw envelope when body.mode is raw', () => {
    const envelope = '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body/></soap:Envelope>';
    const context = makeContext({
      currentRequest: makeRequest({ url: 'https://service.example.com', body: { mode: 'raw', raw: envelope } }) as unknown as ExecutionContext['currentRequest']
    });
    const api = soapPlugin.protocolAPIProvider(context) as { request: { soap: { envelope: { get: () => string | null } } } };
    expect(api.request.soap.envelope.get()).toBe(envelope);
  });

  test('request.soap.envelope.get() returns null when body.mode is operation', () => {
    const context = makeContext({
      currentRequest: makeRequest({ url: 'https://service.example.com', body: { mode: 'operation', args: {} } }) as unknown as ExecutionContext['currentRequest']
    });
    const api = soapPlugin.protocolAPIProvider(context) as { request: { soap: { envelope: { get: () => string | null } } } };
    expect(api.request.soap.envelope.get()).toBeNull();
  });

  test('response.status defaults to 0 with no response data', () => {
    const context = makeContext();
    const api = soapPlugin.protocolAPIProvider(context) as { response: { status: number } };
    expect(api.response.status).toBe(0);
  });

  test('response.soap.fault.hasFault is false with no response data', () => {
    const context = makeContext();
    const api = soapPlugin.protocolAPIProvider(context) as { response: { soap: { fault: { hasFault: boolean } } } };
    expect(api.response.soap.fault.hasFault).toBe(false);
  });

  test('response.to.be.success is true for 200 status', () => {
    const context = makeContext({
      currentResponse: {
        data: { status: 200, statusText: 'OK', headers: {}, body: '', parsed: null, fault: { hasFault: false } },
        summary: { outcome: 'success', code: 200 }
      }
    });
    const api = soapPlugin.protocolAPIProvider(context) as { response: { to: { be: { success: boolean } } } };
    expect(api.response.to.be.success).toBe(true);
  });

  test('response.to.have.soapFault() is true when fault.hasFault is true', () => {
    const context = makeContext({
      currentResponse: {
        data: {
          status: 500, statusText: 'Internal Server Error',
          headers: {}, body: '', parsed: null,
          fault: { hasFault: true, code: 'env:Server', reason: 'Server Error', detail: null }
        },
        summary: { outcome: 'error', code: 500 }
      }
    });
    const api = soapPlugin.protocolAPIProvider(context) as { response: { to: { have: { soapFault: () => boolean } } } };
    expect(api.response.to.have.soapFault()).toBe(true);
  });
});

// ============================================================================
// Execute — Integration Tests (transport-level)
// NOTE: Full SOAP pipeline tests (envelope build, WSDL parsing, WS-Security)
// will be added when the execute pipeline is implemented.
// See todo.md and plans/plugin-soap-implementation-plan.md.
// ============================================================================

describe('soapPlugin — execute() transport', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const responseEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetWeatherResponse xmlns="http://www.webservicex.net">
      <GetWeatherResult>Sunny, 22°C</GetWeatherResult>
    </GetWeatherResponse>
  </soap:Body>
</soap:Envelope>`;
          res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
          res.end(responseEnvelope);
        });
      } else {
        res.writeHead(405);
        res.end();
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, () => {
        serverPort = (server.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  test('returns 200 with XML body for valid POST to SOAP endpoint', async () => {
    const request = makeRequest({
      url: `http://localhost:${serverPort}`,
      soapVersion: '1.1',
      soapAction: 'http://www.webservicex.net/GetWeather',
      body: {
        mode: 'raw',
        raw: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetWeather xmlns="http://www.webservicex.net"><CityName>London</CityName></GetWeather></soap:Body></soap:Envelope>'
      }
    });

    const response = await soapPlugin.execute(request, makeContext(), makeOptions());
    const data = getResponseData(response);

    expect(data.status).toBe(200);
    expect(data.body).toContain('<soap:Envelope');
    expect(response.summary.outcome).toBe('success');
  });

  test('returns error outcome when URL is missing', async () => {
    const request = makeRequest({});
    const response = await soapPlugin.execute(request, makeContext(), makeOptions());
    expect(response.summary.outcome).toBe('error');
    expect(response.summary.code).toBe('validation');
  });
});

// ============================================================================
// TODO: Tests to implement when execute pipeline is complete
// These are stubs that document planned coverage.
// See plans/plugin-soap-implementation-plan.md — Testing Matrix.
// ============================================================================

describe.skip('soapPlugin — SOAP 1.1 envelope (TODO)', () => {
  test('sets Content-Type: text/xml; charset=utf-8');
  test('sets SOAPAction header from soapAction field');
  test('sends correct envelope for raw mode');
  test('builds envelope from WSDL operation and args');
});

describe.skip('soapPlugin — SOAP 1.2 envelope (TODO)', () => {
  test('sets Content-Type: application/soap+xml; charset=utf-8');
  test('includes action parameter in Content-Type when soapAction is set');
  test('does not set standalone SOAPAction header');
});

describe.skip('soapPlugin — SOAP fault detection (TODO)', () => {
  test('detects SOAP 1.1 fault and sets fault.hasFault = true');
  test('extracts faultcode and faultstring from SOAP 1.1 fault');
  test('detects SOAP 1.2 fault and sets fault.hasFault = true');
  test('extracts Code/Value and Reason/Text from SOAP 1.2 fault');
  test('returns hasFault = false for successful response');
});

describe.skip('soapPlugin — WSDL operation mode (TODO)', () => {
  test('loads WSDL from wsdl URL and invokes operation');
  test('serializes args to correct XML with namespace from WSDL schema');
  test('caches WSDL between requests when wsdlCache is true');
  test('does not cache WSDL when wsdlCache is false');
  test('returns error when WSDL cannot be fetched');
  test('returns error when operation is not found in WSDL');
});

describe.skip('soapPlugin — WS-Security (TODO)', () => {
  test('adds UsernameToken header to envelope when security.mode is usernameToken');
  test('includes username and password in UsernameToken');
  test('signs envelope with x509 cert when security.mode is x509');
  test('verifies signature algorithm and digest algorithm from securityOptions');
});

describe.skip('soapPlugin — SSL and proxy (TODO)', () => {
  test('respects options.ssl.validateCertificates = false');
  test('sends client certificate when ssl.clientCertificate is configured');
  test('routes through proxy when options.proxy is configured');
  test('bypasses proxy for hosts listed in options.proxy.bypass');
  test('reads proxy from HTTP_PROXY env var');
  test('reads proxy bypass from NO_PROXY env var');
});

describe.skip('soapPlugin — cookie handling (TODO)', () => {
  test('sends cookies from cookie jar for matching domain');
  test('stores Set-Cookie headers from SOAP response');
  test('stores Set-Cookie headers from SOAP error responses');
});

describe.skip('soapPlugin — auth compatibility (TODO)', () => {
  test('bearer token applied as Authorization header is included in request');
  test('basic auth applied as Authorization header is included in request');
  test('apikey applied as header is included in request');
});
