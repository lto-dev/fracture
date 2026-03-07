// ============================================================================
// SOAP Plugin Types
// ============================================================================

/**
 * Typed shape of the SOAP protocolAPIProvider return value.
 * Used by plugin-soap/index.ts for the return type of protocolAPIProvider,
 * and by scriptDeclarations.assert.ts for compile-time enforcement.
 */

// ----------------------------------------------------------------------------
// Request API types
// ----------------------------------------------------------------------------

export interface SoapRequestHeadersAPI {
  add(header: { key: string; value: string }): void;
  remove(key: string): void;
  get(key: string): string | null;
  upsert(header: { key: string; value: string }): void;
  toObject(): Record<string, string>;
}

export interface SoapEnvelopeAPI {
  get(): string | null;
  set(xml: string): void;
}

export interface SoapRequestSoapAPI {
  readonly version: string | null;
  readonly action: string | null;
  readonly operation: string | null;
  envelope: SoapEnvelopeAPI;
}

export interface SoapScriptRequestAPI {
  url: string;
  headers: SoapRequestHeadersAPI;
  soap: SoapRequestSoapAPI;
}

// ----------------------------------------------------------------------------
// Response API types
// ----------------------------------------------------------------------------

export interface SoapResponseHeadersAPI {
  get(name: string): string | string[] | null;
  has(name: string): boolean;
  toObject(): Record<string, string | string[]>;
}

export interface SoapFaultAPI {
  readonly hasFault: boolean;
  readonly code: string | null;
  readonly reason: string | null;
  readonly detail: string | null;
}

export interface SoapResponseSoapAPI {
  readonly xml: string;
  readonly parsed: unknown;
  readonly fault: SoapFaultAPI;
}

export interface SoapResponseToAPI {
  be: {
    ok: boolean;
    success: boolean;
    clientError: boolean;
    serverError: boolean;
  };
  have: {
    status(code: number): boolean;
    header(name: string): boolean;
    soapFault(): boolean;
  };
}

export interface SoapScriptResponseAPI {
  status: number;
  statusText: string;
  headers: SoapResponseHeadersAPI;
  body: string;
  text(): string;
  json(): unknown;
  soap: SoapResponseSoapAPI;
  duration: number;
  size: number;
  to: SoapResponseToAPI;
}

export interface SoapProtocolAPI {
  request: SoapScriptRequestAPI;
  response: SoapScriptResponseAPI;
  [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Request data schema types (what goes in request.data)
// ----------------------------------------------------------------------------

/**
 * SOAP body mode:
 * - raw: send a pre-built XML SOAP envelope string
 * - operation: WSDL-driven invocation using service/port/operation + args
 */
export type SoapBodyMode = 'raw' | 'operation';

/**
 * WS-Security mode:
 * - none: no SOAP-level security header
 * - usernameToken: WS-Security UsernameToken (username/password in envelope)
 * - x509: XML Digital Signature using a client certificate and key
 */
export type SoapSecurityMode = 'none' | 'usernameToken' | 'x509';

/**
 * SOAP version to use for the envelope and Content-Type header.
 */
export type SoapVersion = '1.1' | '1.2';

/**
 * SOAP body configuration for a request.
 */
export interface SoapBodyData {
  /** Determines how the SOAP body is constructed. */
  mode: SoapBodyMode;
  /** Full XML SOAP envelope string. Required when mode is 'raw'. */
  raw?: string;
  /** Operation arguments object. Required when mode is 'operation'. Passed to the WSDL operation. */
  args?: Record<string, unknown>;
}

/**
 * MTOM/MIME attachment for a SOAP request.
 */
export interface SoapAttachment {
  contentId: string;
  contentType: string;
  filename: string;
  /** Base64-encoded file content. */
  contentBase64: string;
}

/**
 * WS-Security configuration embedded in the request.
 */
export interface SoapSecurity {
  mode: SoapSecurityMode;
  /** Required when mode is 'usernameToken'. */
  username?: string;
  /** Required when mode is 'usernameToken'. */
  password?: string;
  /** PEM certificate path or content. Required when mode is 'x509'. */
  cert?: string;
  /** PEM private key path or content. Required when mode is 'x509'. */
  key?: string;
  /** Passphrase for encrypted private key. */
  passphrase?: string;
}

/**
 * SOAP Request Data Structure — stored in request.data.
 */
export interface SoapRequestData {
  /** HTTP method. Defaults to POST. Override only for edge compatibility. */
  method?: 'POST' | 'GET';
  /** SOAP endpoint URL. Required. */
  url: string;
  /** WSDL location — URL or file path. Required when body.mode is 'operation'. */
  wsdl?: string;
  /** WSDL service name. Required when body.mode is 'operation'. */
  service?: string;
  /** WSDL port name. Required when body.mode is 'operation'. */
  port?: string;
  /** WSDL operation name. Required when body.mode is 'operation'. */
  operation?: string;
  /** SOAP version: '1.1' or '1.2'. Defaults to '1.1'. */
  soapVersion?: SoapVersion;
  /** SOAPAction header value. Optional override; derived from WSDL operation if not set. */
  soapAction?: string;
  /** Additional HTTP headers to include in the request. */
  headers?: Record<string, string>;
  /** SOAP body configuration. */
  body?: SoapBodyData;
  /** MTOM/MIME attachments. */
  attachments?: SoapAttachment[];
  /** WS-Security configuration. */
  security?: SoapSecurity;
}

// ----------------------------------------------------------------------------
// Response data schema types (what goes in ProtocolResponse.data)
// ----------------------------------------------------------------------------

/**
 * SOAP Fault extracted from a SOAP response envelope.
 */
export interface SoapFault {
  hasFault: boolean;
  code?: string;
  reason?: string;
  detail?: string;
}

/**
 * SOAP Response Data Structure — stored in ProtocolResponse.data.
 */
export interface SoapResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  /** Raw XML response body (the full SOAP envelope). */
  body: string;
  /** Parsed representation of the SOAP body content. */
  parsed: unknown;
  /** Extracted SOAP fault information. */
  fault: SoapFault;
}
