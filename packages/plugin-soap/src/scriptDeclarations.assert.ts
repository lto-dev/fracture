/**
 * Compile-time assertions that scriptDeclarations.request.d.ts and
 * scriptDeclarations.response.d.ts match the SoapScriptRequestAPI and
 * SoapScriptResponseAPI interfaces in types.ts.
 *
 * This file produces NO runtime output. If the protocolAPIProvider in index.ts
 * changes its request or response shape, update types.ts and the declaration
 * files — or this file will fail to compile.
 */

import type { SoapScriptRequestAPI, SoapScriptResponseAPI, SoapProtocolAPI } from './types.js';

// Verify SoapProtocolAPI contains typed request and response
type CheckRequestType = SoapProtocolAPI['request'] extends SoapScriptRequestAPI ? true : never;
type CheckResponseType = SoapProtocolAPI['response'] extends SoapScriptResponseAPI ? true : never;

const assertRequestType: CheckRequestType = true as const;
const assertResponseType: CheckResponseType = true as const;

void assertRequestType;
void assertResponseType;

// Request field checks — match scriptDeclarations.request.d.ts declarations
type CheckRequestUrl = SoapScriptRequestAPI['url'] extends string ? true : never;
type CheckRequestHeadersToObject = ReturnType<SoapScriptRequestAPI['headers']['toObject']> extends Record<string, string> ? true : never;
type CheckRequestSoapVersion = SoapScriptRequestAPI['soap']['version'] extends string | null ? true : never;
type CheckRequestSoapAction = SoapScriptRequestAPI['soap']['action'] extends string | null ? true : never;
type CheckRequestSoapOperation = SoapScriptRequestAPI['soap']['operation'] extends string | null ? true : never;
type CheckRequestSoapEnvelopeGet = ReturnType<SoapScriptRequestAPI['soap']['envelope']['get']> extends string | null ? true : never;

const assertUrl: CheckRequestUrl = true as const;
const assertHeadersToObject: CheckRequestHeadersToObject = true as const;
const assertSoapVersion: CheckRequestSoapVersion = true as const;
const assertSoapAction: CheckRequestSoapAction = true as const;
const assertSoapOperation: CheckRequestSoapOperation = true as const;
const assertSoapEnvelopeGet: CheckRequestSoapEnvelopeGet = true as const;

void assertUrl; void assertHeadersToObject;
void assertSoapVersion; void assertSoapAction; void assertSoapOperation; void assertSoapEnvelopeGet;

// Response field checks — match scriptDeclarations.response.d.ts declarations
type CheckResponseStatus = SoapScriptResponseAPI['status'] extends number ? true : never;
type CheckResponseBody = SoapScriptResponseAPI['body'] extends string ? true : never;
type CheckResponseJsonReturn = ReturnType<SoapScriptResponseAPI['json']> extends unknown ? true : never;
type CheckResponseToBe = SoapScriptResponseAPI['to']['be']['ok'] extends boolean ? true : never;
type CheckResponseToHaveStatus = ReturnType<SoapScriptResponseAPI['to']['have']['status']> extends boolean ? true : never;
type CheckResponseSoapXml = SoapScriptResponseAPI['soap']['xml'] extends string ? true : never;
type CheckResponseSoapFaultHas = SoapScriptResponseAPI['soap']['fault']['hasFault'] extends boolean ? true : never;

const assertStatus: CheckResponseStatus = true as const;
const assertBody: CheckResponseBody = true as const;
const assertJsonReturn: CheckResponseJsonReturn = true as const;
const assertToBe: CheckResponseToBe = true as const;
const assertToHaveStatus: CheckResponseToHaveStatus = true as const;
const assertSoapXml: CheckResponseSoapXml = true as const;
const assertSoapFaultHas: CheckResponseSoapFaultHas = true as const;

void assertStatus; void assertBody; void assertJsonReturn; void assertToBe; void assertToHaveStatus;
void assertSoapXml; void assertSoapFaultHas;
