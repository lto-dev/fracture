/**
 * SOAP protocol — request IntelliSense declarations
 *
 * Ambient declarations describing what quest.request exposes when the active
 * protocol is SOAP. Registered with Monaco via addExtraLib() for pre-request
 * and post-request script editors.
 *
 * Source of truth: protocolAPIProvider() in fracture/packages/plugin-soap/src/index.ts
 * Enforcement: scriptDeclarations.assert.ts verifies these match the runtime shape.
 */

declare interface SoapRequestHeaders {
  add(header: { key: string; value: string }): void;
  remove(key: string): void;
  get(key: string): string | null;
  upsert(header: { key: string; value: string }): void;
  toObject(): Record<string, string>;
}

declare interface SoapEnvelope {
  /** Get the current raw XML envelope string, or null if not set. */
  get(): string | null;
  /** Replace the raw XML envelope string. */
  set(xml: string): void;
}

declare interface SoapRequestSoap {
  /** SOAP version: '1.1' or '1.2'. */
  readonly version: string | null;
  /** SOAPAction header value. */
  readonly action: string | null;
  /** WSDL operation name for operation-mode requests. */
  readonly operation: string | null;
  /** Access and mutate the raw SOAP envelope. */
  envelope: SoapEnvelope;
}

declare const quest: {
  request: {
    /**
     * The SOAP service endpoint URL — where the POST request is sent.
     * This is the service address, not the WSDL location.
     * The WSDL (if used) is a configuration field in request.data and is not exposed here.
     */
    url: string;
    headers: SoapRequestHeaders;
    soap: SoapRequestSoap;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
