import got, { type OptionsOfTextResponseBody, RequestError } from 'got';
import type { IProtocolPlugin, Request, ExecutionContext, ProtocolResponse, ValidationResult, ValidationError, RuntimeOptions, ILogger } from '@apiquest/types';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import type { SoapProtocolAPI, SoapRequestData } from './types.js';

// Export types for external consumption
export type {
  SoapResponseData,
  SoapBodyMode,
  SoapBodyData,
  SoapAttachment,
  SoapSecurity,
  SoapSecurityMode,
  SoapVersion,
  SoapFault,
  SoapRequestData,
  SoapProtocolAPI,
  SoapScriptRequestAPI,
  SoapScriptResponseAPI
} from './types.js';

// Helper functions for string validation
function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Parse proxy configuration from environment variables.
 * Platform-agnostic: checks both uppercase and lowercase variants.
 */
function getProxyFromEnv(targetUrl: string): { host: string; port: number; auth?: { username: string; password: string } } | null {
  const HTTP_PROXY = process.env.HTTP_PROXY ?? process.env.http_proxy;
  const HTTPS_PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;

  const proxyUrl = targetUrl.startsWith('https:') ? (HTTPS_PROXY ?? HTTP_PROXY) : HTTP_PROXY;

  if (proxyUrl === undefined || proxyUrl === '') {
    return null;
  }

  try {
    const parsed = new URL(proxyUrl);
    return {
      host: parsed.hostname,
      port: (parsed.port !== '' ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80)),
      auth: parsed.username !== '' ? {
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password)
      } : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Check if a URL target should bypass proxy based on NO_PROXY env var.
 */
function shouldBypassProxy(targetUrl: string): boolean {
  const NO_PROXY = process.env.NO_PROXY ?? process.env.no_proxy;

  if (NO_PROXY === undefined || NO_PROXY === '') {
    return false;
  }

  const bypassList = NO_PROXY.split(',').map(s => s.trim());
  const parsed = new URL(targetUrl);

  return bypassList.some(pattern => {
    return parsed.hostname === pattern ||
           (pattern.startsWith('*.') && parsed.hostname.endsWith(pattern.slice(1)));
  });
}

export const soapPlugin: IProtocolPlugin = {
  name: 'SOAP Client',
  version: '1.0.0',
  description: 'SOAP 1.1 and 1.2 protocol support with WSDL-driven operations and WS-Security',

  // Protocols this plugin provides
  protocols: ['soap'],

  // Transport-level auth types (applied by plugin-auth as HTTP headers before dispatch)
  supportedAuthTypes: ['bearer', 'basic', 'oauth2', 'apikey'],

  // Accept additional auth plugins beyond the listed types
  strictAuthList: false,

  protocolAPIProvider(context: ExecutionContext): SoapProtocolAPI {
    const data = (context.currentResponse?.data ?? {}) as {
      status?: number;
      statusText?: string;
      headers?: Record<string, string | string[]>;
      body?: string;
      parsed?: unknown;
      fault?: {
        hasFault?: boolean;
        code?: string;
        reason?: string;
        detail?: string;
      };
    };

    const reqData = (context.currentRequest?.data as unknown) as SoapRequestData | undefined;

    return {
      request: {
        url: reqData?.url ?? '',

        headers: {
          add(header: { key: string; value: string }) {
            if (context.currentRequest === null || context.currentRequest === undefined) return;
            context.currentRequest.data.headers ??= {};
            (context.currentRequest.data.headers as Record<string, string>)[header.key] = header.value;
          },
          remove(key: string) {
            if ((context.currentRequest?.data.headers ?? null) === null) return;
            delete (context.currentRequest!.data.headers as Record<string, string>)[key];
          },
          get(key: string) {
            if ((context.currentRequest?.data.headers ?? null) === null) return null;
            const lowerKey = key.toLowerCase();
            for (const [headerKey, value] of Object.entries(context.currentRequest!.data.headers as Record<string, string>)) {
              if (headerKey.toLowerCase() === lowerKey) return value;
            }
            return null;
          },
          upsert(header: { key: string; value: string }) {
            if (context.currentRequest === null || context.currentRequest === undefined) return;
            context.currentRequest.data.headers ??= {};
            (context.currentRequest.data.headers as Record<string, string>)[header.key] = header.value;
          },
          toObject() {
            return (context.currentRequest?.data.headers ?? {}) as Record<string, string>;
          }
        },

        soap: {
          get version() {
            return reqData?.soapVersion ?? null;
          },
          get action() {
            return reqData?.soapAction ?? null;
          },
          get operation() {
            return reqData?.operation ?? null;
          },
          envelope: {
            get() {
              const body = reqData?.body;
              if (body === null || body === undefined) return null;
              if (body.mode === 'raw') return body.raw ?? null;
              return null;
            },
            set(xml: string) {
              if (context.currentRequest === null || context.currentRequest === undefined) return;
              const d = (context.currentRequest.data as unknown) as SoapRequestData;
              d.body = { mode: 'raw', raw: xml };
            }
          }
        }
      },

      response: {
        status: data.status ?? 0,
        statusText: data.statusText ?? '',

        headers: {
          get(name: string) {
            if ((data.headers ?? null) === null) return null;
            const lowerName = name.toLowerCase();
            for (const [key, value] of Object.entries(data.headers!)) {
              if (key.toLowerCase() === lowerName) return value;
            }
            return null;
          },
          has(name: string) {
            if ((data.headers ?? null) === null) return false;
            const lowerName = name.toLowerCase();
            return Object.keys(data.headers!).some(k => k.toLowerCase() === lowerName);
          },
          toObject() {
            return data.headers ?? {};
          }
        },

        body: data.body ?? '',
        text() {
          return data.body ?? '';
        },
        json() {
          try {
            return JSON.parse(data.body ?? '{}') as unknown;
          } catch {
            return {};
          }
        },

        soap: {
          get xml() {
            return data.body ?? '';
          },
          get parsed() {
            return data.parsed ?? null;
          },
          fault: {
            get hasFault() {
              return data.fault?.hasFault ?? false;
            },
            get code() {
              return data.fault?.code ?? null;
            },
            get reason() {
              return data.fault?.reason ?? null;
            },
            get detail() {
              return data.fault?.detail ?? null;
            }
          }
        },

        duration: context.currentResponse?.summary?.duration ?? 0,
        size: data.body?.length ?? 0,

        to: {
          be: {
            ok: data.status === 200,
            success: data.status !== undefined && data.status >= 200 && data.status < 300,
            clientError: data.status !== undefined && data.status >= 400 && data.status < 500,
            serverError: data.status !== undefined && data.status >= 500 && data.status < 600
          },
          have: {
            status(code: number) {
              return data.status === code;
            },
            header(name: string) {
              if ((data.headers ?? null) === null) return false;
              const lowerName = name.toLowerCase();
              return Object.keys(data.headers!).some(k => k.toLowerCase() === lowerName);
            },
            soapFault() {
              return data.fault?.hasFault ?? false;
            }
          }
        }
      }
    };
  },

  // Data schema for SOAP requests
  dataSchema: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'SOAP service endpoint URL'
      },
      wsdl: {
        type: 'string',
        description: 'WSDL location — URL or file path. Required when body.mode is operation'
      },
      service: {
        type: 'string',
        description: 'WSDL service name. Required when body.mode is operation'
      },
      port: {
        type: 'string',
        description: 'WSDL port name. Required when body.mode is operation'
      },
      operation: {
        type: 'string',
        description: 'SOAP operation name. Required when body.mode is operation. Used to derive SOAPAction from WSDL'
      },
      soapVersion: {
        type: 'string',
        enum: ['1.1', '1.2'],
        default: '1.1',
        description: 'SOAP envelope version. Determines Content-Type and envelope namespace'
      },
      soapAction: {
        type: 'string',
        description: 'SOAPAction HTTP header value. Derived from WSDL binding if not set explicitly'
      },
      headers: {
        type: 'object',
        description: 'Additional HTTP headers to include in the request',
        additionalProperties: { type: 'string' }
      },
      body: {
        type: 'object',
        required: ['mode'],
        description: 'SOAP body configuration',
        properties: {
          mode: {
            type: 'string',
            enum: ['raw', 'operation'],
            description: 'raw: user provides full XML envelope string. operation: plugin builds envelope from WSDL and args'
          },
          raw: {
            type: 'string',
            description: 'Full XML SOAP envelope string. Required when mode is raw'
          },
          args: {
            type: 'object',
            description: 'Operation arguments. Required when mode is operation. Serialized to XML using the WSDL schema',
            additionalProperties: true
          }
        }
      },
      attachments: {
        type: 'array',
        description: 'MTOM/MIME attachments',
        items: {
          type: 'object',
          required: ['contentId', 'contentType', 'filename', 'contentBase64'],
          properties: {
            contentId: { type: 'string' },
            contentType: { type: 'string' },
            filename: { type: 'string' },
            contentBase64: { type: 'string', description: 'Base64-encoded file content' }
          }
        }
      },
      security: {
        type: 'object',
        description: 'WS-Security configuration. Generates a SOAP Security header in the envelope',
        required: ['mode'],
        properties: {
          mode: {
            type: 'string',
            enum: ['none', 'usernameToken', 'x509'],
            description: 'WS-Security mode'
          },
          username: { type: 'string', description: 'Required when mode is usernameToken' },
          password: { type: 'string', description: 'Required when mode is usernameToken' },
          cert: { type: 'string', description: 'PEM certificate path or content. Required when mode is x509' },
          key: { type: 'string', description: 'PEM private key path or content. Required when mode is x509' },
          passphrase: { type: 'string', description: 'Passphrase for encrypted private key' }
        }
      }
    }
  },

  // Options schema for SOAP-specific runtime configuration (options.plugins.soap)
  // Only primitive types are supported here per PluginOptionsSchema contract.
  // Non-primitive options (parseOptions, securityOptions) are documented in docs/index.md
  // and read directly from options.plugins.soap at runtime.
  optionsSchema: {
    keepAlive: {
      type: 'boolean',
      default: true,
      description: 'Keep TCP connections alive between SOAP requests'
    },
    timeout: {
      type: 'number',
      default: 30000,
      description: 'Request timeout in milliseconds. Overrides options.timeout.request'
    },
    followRedirects: {
      type: 'boolean',
      default: true,
      description: 'Follow HTTP redirects automatically'
    },
    maxRedirects: {
      type: 'number',
      default: 5,
      description: 'Maximum number of redirects to follow'
    },
    validateCertificates: {
      type: 'boolean',
      default: true,
      description: 'Validate SSL/TLS certificates. Overrides options.ssl.validateCertificates'
    },
    wsdlCache: {
      type: 'boolean',
      default: true,
      description: 'Cache parsed WSDL documents in memory during a run to avoid repeated fetching'
    }
  },

  async execute(request: Request, context: ExecutionContext, options: RuntimeOptions, _emitEvent?: (eventName: string, eventData: unknown) => Promise<void>, logger?: ILogger): Promise<ProtocolResponse> {
    const startTime = Date.now();
    const reqData = (request.data as unknown) as SoapRequestData;
    const url = reqData.url ?? '';

    // TODO: Implement full SOAP execute pipeline.
    // See plans/plugin-soap-implementation-plan.md — Execution Pipeline section.
    //
    // Steps to implement:
    //   1. Validate request shape (done in validate(), but double-check url here)
    //   2. Resolve runtime options: options.plugins.soap overrides global options
    //   3. Build transport config: SSL, proxy, redirects, timeout, cookie jar
    //   4. Resolve SOAP request mode:
    //      - body.mode = 'raw'       → use body.raw as the full XML envelope
    //      - body.mode = 'operation' → load WSDL, invoke service.port.operation(body.args)
    //   5. Apply WS-Security from request.data.security:
    //      - usernameToken → generate wsse:Security/UsernameToken header in envelope
    //      - x509         → sign envelope with xml-crypto using cert/key from security fields
    //   6. Determine Content-Type and SOAPAction:
    //      - SOAP 1.1: Content-Type: text/xml; charset=utf-8 + SOAPAction header
    //      - SOAP 1.2: Content-Type: application/soap+xml; charset=utf-8 + action parameter
    //   7. Dispatch over got transport
    //   8. Parse response XML with fast-xml-parser, detect SOAP fault semantics
    //   9. Normalize ProtocolResponse.data to SoapResponseData shape
    //  10. Persist Set-Cookie headers

    try {
      if (isNullOrWhitespace(url)) {
        logger?.error('SOAP request missing URL');
        const duration = Date.now() - startTime;
        return {
          data: {
            status: 0,
            statusText: 'Error',
            headers: {},
            body: '',
            parsed: null,
            fault: { hasFault: false }
          },
          summary: {
            outcome: 'error',
            code: 'validation',
            label: 'Error',
            message: 'URL is required for SOAP requests',
            duration
          }
        };
      }

      // Resolve runtime options — options.plugins.soap overrides global defaults
      const soapOptions = (options.plugins?.soap as Record<string, unknown> | null | undefined) ?? {};
      const soapTimeout = typeof soapOptions.timeout === 'number' ? soapOptions.timeout : null;
      const timeout = options.timeout?.request ?? soapTimeout ?? 60000;
      const soapValidateCerts = typeof soapOptions.validateCertificates === 'boolean' ? soapOptions.validateCertificates : null;
      const validateCerts = options.ssl?.validateCertificates ?? soapValidateCerts ?? true;
      const soapFollowRedirects = typeof soapOptions.followRedirects === 'boolean' ? soapOptions.followRedirects : null;
      const followRedirects = options.followRedirects ?? soapFollowRedirects ?? true;

      // Determine SOAP version and set appropriate Content-Type
      const soapVersion = reqData.soapVersion ?? '1.1';
      const soapAction = reqData.soapAction ?? '';
      const contentType = soapVersion === '1.2'
        ? `application/soap+xml; charset=utf-8${soapAction !== '' ? `; action="${soapAction}"` : ''}`
        : 'text/xml; charset=utf-8';

      // Build headers — user-defined headers merge with SOAP protocol headers
      const userHeaders: Record<string, string> = typeof reqData.headers === 'object' && reqData.headers !== null
        ? Object.fromEntries(Object.entries(reqData.headers).map(([k, v]) => [k, String(v)]))
        : {};

      const soapHeaders: Record<string, string> = {
        'Content-Type': contentType
      };

      // SOAPAction is only a standalone header in SOAP 1.1
      if (soapVersion === '1.1') {
        soapHeaders['SOAPAction'] = `"${soapAction}"`;
      }

      // User headers override SOAP default headers
      const mergedHeaders = { ...soapHeaders, ...userHeaders };

      // Cookie handling
      const cookieHeader = context.cookieJar.getCookieHeader(url);
      if (cookieHeader !== null) {
        mergedHeaders['Cookie'] = cookieHeader;
        logger?.trace('Cookie header applied', { url });
      }

      // Proxy resolution (mirrors plugin-http behavior)
      let proxyConfig = options.proxy;
      if ((proxyConfig?.host === undefined) && shouldBypassProxy(url) === false) {
        const envProxy = getProxyFromEnv(url);
        if (envProxy !== null) {
          proxyConfig = { enabled: true, host: envProxy.host, port: envProxy.port, auth: envProxy.auth };
        }
      }

      const gotOptions: OptionsOfTextResponseBody = {
        method: 'POST',
        headers: mergedHeaders,
        throwHttpErrors: false,
        timeout: { request: timeout },
        followRedirect: followRedirects,
        https: {
          rejectUnauthorized: validateCerts,
          certificate: options.ssl?.clientCertificate?.cert,
          key: options.ssl?.clientCertificate?.key,
          passphrase: options.ssl?.clientCertificate?.passphrase,
          certificateAuthority: options.ssl?.ca
        },
        signal: (context.abortSignal ?? undefined) as AbortSignal | undefined
      };

      // Proxy agent setup
      if (proxyConfig?.enabled !== false && proxyConfig?.host !== undefined && proxyConfig.host !== '') {
        const targetUrl = new URL(url);
        const explicitBypass = proxyConfig.bypass?.some(pattern =>
          targetUrl.hostname === pattern ||
          (pattern.startsWith('*.') && targetUrl.hostname.endsWith(pattern.slice(1)))
        ) ?? false;

        if ((explicitBypass || shouldBypassProxy(url)) === false) {
          const proxyAuth = (proxyConfig.auth !== undefined && proxyConfig.auth !== null)
            ? `${encodeURIComponent(proxyConfig.auth.username)}:${encodeURIComponent(proxyConfig.auth.password)}@`
            : '';
          const fullProxyUrl = `http://${proxyAuth}${proxyConfig.host}:${proxyConfig.port}`;
          gotOptions.agent = {
            http: new HttpProxyAgent({
              keepAlive: true, keepAliveMsecs: 1000,
              maxSockets: 256, maxFreeSockets: 256,
              scheduling: 'lifo', proxy: fullProxyUrl
            }),
            https: new HttpsProxyAgent({
              keepAlive: true, keepAliveMsecs: 1000,
              maxSockets: 256, maxFreeSockets: 256,
              scheduling: 'lifo', proxy: fullProxyUrl
            })
          };
        }
      }

      // TODO: Build SOAP envelope from body configuration before dispatch.
      // For now this is a transport-level stub that sends whatever body.raw contains.
      // Full implementation will:
      //   - raw mode: use body.raw as gotOptions.body
      //   - operation mode: load WSDL with soap library, build envelope from body.args
      const rawBody = reqData.body?.mode === 'raw' ? (reqData.body.raw ?? '') : '';
      if (rawBody !== '') {
        gotOptions.body = rawBody;
      }

      logger?.debug('SOAP request dispatch', { url, soapVersion, operation: reqData.operation });
      const response = await got(url, gotOptions);
      const duration = Date.now() - startTime;

      // Normalize response headers
      const normalizedHeaders: Record<string, string | string[]> = {};
      if (typeof response.headers === 'object' && response.headers !== null) {
        Object.entries(response.headers).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            normalizedHeaders[key.toLowerCase()] = value.map(item => String(item));
          } else if (value !== undefined && value !== null) {
            normalizedHeaders[key.toLowerCase()] = String(value);
          }
        });
      }

      if (normalizedHeaders['set-cookie'] !== undefined) {
        context.cookieJar.store(normalizedHeaders['set-cookie'], url);
        logger?.trace('Cookies stored from SOAP response', { url });
      }

      logger?.debug('SOAP response received', { status: response.statusCode, duration });

      // TODO: Parse response XML with fast-xml-parser and extract fault details.
      return {
        data: {
          status: response.statusCode,
          statusText: response.statusMessage ?? '',
          headers: normalizedHeaders,
          body: String(response.body),
          parsed: null,          // TODO: populated by XML parser
          fault: { hasFault: false }  // TODO: extracted from parsed XML
        },
        summary: {
          outcome: 'success',
          code: response.statusCode,
          label: response.statusMessage ?? '',
          duration
        }
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err as RequestError;

      if (error instanceof RequestError && error.name === 'AbortError') {
        logger?.warn('SOAP request aborted', { url, duration });
        return {
          data: {
            status: 0, statusText: 'Aborted',
            headers: {}, body: '', parsed: null,
            fault: { hasFault: false }
          },
          summary: { outcome: 'error', code: 'aborted', label: 'Aborted', message: 'Request aborted', duration }
        };
      }

      if (error instanceof RequestError) {
        if (error.response !== undefined) {
          const normalizedHeaders: Record<string, string | string[]> = {};
          Object.entries(error.response.headers).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              normalizedHeaders[key.toLowerCase()] = value.map(item => String(item));
            } else if (value !== undefined && value !== null) {
              normalizedHeaders[key.toLowerCase()] = String(value);
            }
          });

          if (normalizedHeaders['set-cookie'] !== undefined) {
            context.cookieJar.store(normalizedHeaders['set-cookie'], url);
          }

          logger?.debug('SOAP error response received', { status: error.response.statusCode, duration });

          return {
            data: {
              status: error.response.statusCode,
              statusText: error.response.statusMessage ?? '',
              headers: normalizedHeaders,
              body: String(error.response.body),
              parsed: null,
              fault: { hasFault: false }
            },
            summary: {
              outcome: 'error',
              code: error.response.statusCode,
              label: error.response.statusMessage ?? '',
              duration
            }
          };
        }

        logger?.warn('SOAP network error', { message: error.message, duration });
        return {
          data: {
            status: 0, statusText: 'Network Error',
            headers: {}, body: '', parsed: null,
            fault: { hasFault: false }
          },
          summary: {
            outcome: 'error', code: 'network', label: 'Network Error',
            message: !isNullOrEmpty(error.message) ? error.message : 'Network request failed',
            duration
          }
        };
      }

      logger?.error('SOAP unexpected error', { error: err instanceof Error ? err.message : String(err), duration });
      return {
        data: {
          status: 0, statusText: 'Error',
          headers: {}, body: '', parsed: null,
          fault: { hasFault: false }
        },
        summary: {
          outcome: 'error', code: 'unexpected', label: 'Error',
          message: err instanceof Error ? err.message : String(err),
          duration
        }
      };
    }
  },

  validate(request: Request, _options: RuntimeOptions): ValidationResult {
    const errors: ValidationError[] = [];
    const data = (request.data as unknown) as SoapRequestData;

    // URL is always required
    if (typeof data.url !== 'string' || isNullOrWhitespace(data.url)) {
      errors.push({
        message: 'URL is required for SOAP requests',
        location: 'url',
        source: 'protocol'
      });
    }

    // SOAP version must be 1.1 or 1.2 if specified
    if (data.soapVersion !== undefined && data.soapVersion !== '1.1' && data.soapVersion !== '1.2') {
      errors.push({
        message: `Invalid SOAP version: ${data.soapVersion}. Must be '1.1' or '1.2'`,
        location: 'soapVersion',
        source: 'protocol'
      });
    }

    // Body mode validation
    if (data.body !== undefined) {
      const mode = data.body.mode;

      if (mode !== 'raw' && mode !== 'operation') {
        errors.push({
          message: `Invalid body mode: ${mode}. Must be 'raw' or 'operation'`,
          location: 'body.mode',
          source: 'protocol'
        });
      } else if (mode === 'raw') {
        if (isNullOrWhitespace(data.body.raw)) {
          errors.push({
            message: 'body.raw is required when body.mode is raw and must contain a valid XML SOAP envelope',
            location: 'body.raw',
            source: 'protocol'
          });
        }
      } else if (mode === 'operation') {
        if (isNullOrWhitespace(data.wsdl)) {
          errors.push({ message: 'wsdl is required when body.mode is operation', location: 'wsdl', source: 'protocol' });
        }
        if (isNullOrWhitespace(data.service)) {
          errors.push({ message: 'service is required when body.mode is operation', location: 'service', source: 'protocol' });
        }
        if (isNullOrWhitespace(data.port)) {
          errors.push({ message: 'port is required when body.mode is operation', location: 'port', source: 'protocol' });
        }
        if (isNullOrWhitespace(data.operation)) {
          errors.push({ message: 'operation is required when body.mode is operation', location: 'operation', source: 'protocol' });
        }
      }
    }

    // WS-Security validation
    if (data.security !== undefined) {
      const secMode = data.security.mode;

      if (secMode !== 'none' && secMode !== 'usernameToken' && secMode !== 'x509') {
        errors.push({
          message: `Invalid security mode: ${secMode}. Must be 'none', 'usernameToken', or 'x509'`,
          location: 'security.mode',
          source: 'protocol'
        });
      } else if (secMode === 'usernameToken') {
        if (isNullOrWhitespace(data.security.username)) {
          errors.push({ message: 'security.username is required when security.mode is usernameToken', location: 'security.username', source: 'protocol' });
        }
        if (data.security.password === undefined) {
          errors.push({ message: 'security.password is required when security.mode is usernameToken', location: 'security.password', source: 'protocol' });
        }
      } else if (secMode === 'x509') {
        if (isNullOrWhitespace(data.security.cert)) {
          errors.push({ message: 'security.cert is required when security.mode is x509', location: 'security.cert', source: 'protocol' });
        }
        if (isNullOrWhitespace(data.security.key)) {
          errors.push({ message: 'security.key is required when security.mode is x509', location: 'security.key', source: 'protocol' });
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }
};

export default soapPlugin;
