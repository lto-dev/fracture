/**
 * SOAP protocol — response IntelliSense declarations
 *
 * Ambient declarations describing what quest.response exposes when the active
 * protocol is SOAP. Registered with Monaco via addExtraLib() for post-request
 * script editors.
 *
 * Source of truth: protocolAPIProvider() in fracture/packages/plugin-soap/src/index.ts
 * Enforcement: scriptDeclarations.assert.ts verifies these match the runtime shape.
 */

declare interface SoapResponseHeaders {
  get(name: string): string | string[] | null;
  has(name: string): boolean;
  toObject(): Record<string, string | string[]>;
}

declare interface SoapFaultResult {
  /** True if the SOAP response contains a Fault element. */
  readonly hasFault: boolean;
  /** SOAP fault code (faultcode / Code/Value). */
  readonly code: string | null;
  /** Human-readable fault reason (faultstring / Reason/Text). */
  readonly reason: string | null;
  /** Fault detail content as a string, if present. */
  readonly detail: string | null;
}

declare interface SoapResponseSoap {
  /** Raw XML string of the full SOAP response envelope. */
  readonly xml: string;
  /** Parsed representation of the SOAP body content as a plain object. */
  readonly parsed: unknown;
  /** Extracted SOAP fault details. Check hasFault first. */
  readonly fault: SoapFaultResult;
}

declare interface SoapResponseTo {
  be: {
    ok: boolean;
    success: boolean;
    clientError: boolean;
    serverError: boolean;
  };
  have: {
    status(code: number): boolean;
    header(name: string): boolean;
    /** True if the response contains a SOAP Fault element. */
    soapFault(): boolean;
  };
}

declare interface SoapResponse {
  status: number;
  statusText: string;
  headers: SoapResponseHeaders;
  /** Raw XML response body (full SOAP envelope). */
  body: string;
  /** Alias for body — returns the raw XML string. */
  text(): string;
  /**
   * Parses the SOAP body content as JSON.
   * Returns the parsed object or {} if parsing fails.
   * Prefer quest.response.soap.parsed for most SOAP use cases.
   */
  json(): unknown;
  /** SOAP-specific response data: raw XML, parsed object, and fault details. */
  soap: SoapResponseSoap;
  /** Response duration in milliseconds. */
  duration: number;
  /** Response body size in bytes. */
  size: number;
  to: SoapResponseTo;
}

declare const quest: {
  response: SoapResponse;
  [key: string]: unknown;
};
