/**
 * Script IntelliSense — Base ambient declarations
 *
 * Single source of truth for what the script sandbox exposes globally.
 * This file is a hand-written .d.ts placed in src/ so that tsc copies it
 * verbatim to dist/ without wrapping it in module syntax.
 * The desktop imports dist/scriptDeclarations.d.ts via Vite ?raw and
 * registers the string with Monaco via addExtraLib().
 *
 * Enforcement: scriptDeclarations.assert.ts imports QuestScriptTypes.ts
 * and type-checks that the runtime shapes match what is declared here.
 */

declare interface QuestVariablesStore {
  get(key: string): string | number | boolean | null;
  set(key: string, value: string | number | boolean | null): void;
  has(key: string): boolean;
  remove(key: string): boolean;
  clear(): void;
  toObject(): Record<string, string | number | boolean | null>;
}

declare interface QuestVariables {
  get(key: string): string | number | boolean | null;
  set(key: string, value: string | number | boolean | null): void;
  has(key: string): boolean;
  replaceIn(template: string): string;
}

declare interface QuestCollectionInfo {
  id: string;
  name: string;
  version: string | null;
  description: string | null;
}

declare interface QuestIterationData {
  get(key: string): string | number | boolean | null;
  has(key: string): boolean;
  toObject(): Record<string, string | number | boolean>;
  keys(): string[];
  all(): Array<Record<string, string | number | boolean>>;
}

declare interface QuestHistoryFilterCriteria {
  path?: string;
  name?: string;
  iteration?: number;
  id?: string;
}

declare interface QuestHistoryEntry {
  id: string;
  name: string;
  path: string;
  iteration: number;
}

declare interface QuestHistoryRequests {
  count(): number;
  get(idOrName: string): QuestHistoryEntry | null;
  all(): QuestHistoryEntry[];
  last(): QuestHistoryEntry | null;
  filter(criteria: QuestHistoryFilterCriteria): QuestHistoryEntry[];
}

declare interface QuestRequestInfo {
  name: string;
  id: string;
  protocol: string;
  description: string;
}

declare interface QuestRequestTimeout {
  set(ms: number): void;
  get(): number | null;
}

declare interface QuestEventData {
  json(): unknown;
  [key: string]: unknown;
}

declare interface QuestEvent {
  name: string;
  timestamp: string;
  data: QuestEventData;
  index: number;
}

declare interface QuestSendRequestBody {
  mode?: 'raw' | 'urlencoded' | 'formdata';
  raw?: string;
  kv?: Array<{ key: string; value: string; type?: 'text' | 'binary' }>;
}

declare interface QuestSendRequest {
  url: string;
  method?: string;
  header?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string | QuestSendRequestBody;
}

declare interface QuestSendRequestResponse {
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string | string[]>;
  time: number;
  json(): unknown;
  text(): string;
}

declare interface QuestCookieSetOptions {
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: Date;
  maxAge?: number;
}

declare interface QuestCookies {
  get(name: string): string | null;
  set(name: string, value: string, options?: QuestCookieSetOptions): void;
  has(name: string): boolean;
  remove(name: string): void;
  clear(): void;
  toObject(): Record<string, string>;
}

declare interface QuestConsole {
  log(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

declare interface QuestMomentInstance {
  format(formatString?: string): string;
  toISOString(): string;
  toDate(): Date;
  valueOf(): number;
  isValid(): boolean;
}

declare interface QuestMomentStatic {
  (input?: unknown): QuestMomentInstance;
  utc(input?: unknown): QuestMomentInstance;
  unix(timestamp: number): QuestMomentInstance;
  isMoment(value: unknown): boolean;
}

declare const quest: {
  test(name: string, fn: () => void | Promise<void>): void;
  skip(name: string, fn: () => void | Promise<void>): void;
  fail(message?: string): void;
  sendRequest(request: QuestSendRequest): Promise<QuestSendRequestResponse>;
  sendRequest(request: QuestSendRequest, callback: (err: Error | null, res: QuestSendRequestResponse | null) => void): void;
  wait(ms: number): Promise<void>;
  variables: QuestVariables;
  global: { variables: QuestVariablesStore };
  collection: { info: QuestCollectionInfo; variables: QuestVariablesStore };
  environment: { name: string | null; variables: QuestVariablesStore };
  scope: { variables: QuestVariablesStore };
  request: {
    info: QuestRequestInfo;
    timeout: QuestRequestTimeout;
    dependsOn: string[] | null;
    condition: string | null;
    [key: string]: unknown;
  };
  response: unknown;
  iteration: {
    current: number;
    count: number;
    data: QuestIterationData;
  };
  history: { requests: QuestHistoryRequests };
  cookies: QuestCookies;
  event: QuestEvent | null;
  expectMessages(count: number): void;
};

declare interface ChaiExpect {
  (val: unknown, message?: string): ChaiAssertion;
  fail(message?: string): never;
  fail(actual: unknown, expected: unknown, message?: string, operator?: string): never;
}

declare interface ChaiAssertion {
  to: ChaiAssertion;
  be: ChaiAssertion;
  been: ChaiAssertion;
  is: ChaiAssertion;
  that: ChaiAssertion;
  which: ChaiAssertion;
  and: ChaiAssertion;
  has: ChaiAssertion;
  have: ChaiAssertion;
  with: ChaiAssertion;
  at: ChaiAssertion;
  of: ChaiAssertion;
  same: ChaiAssertion;
  but: ChaiAssertion;
  does: ChaiAssertion;
  still: ChaiAssertion;
  not: ChaiAssertion;
  deep: ChaiAssertion;
  ok: ChaiAssertion;
  true: ChaiAssertion;
  false: ChaiAssertion;
  null: ChaiAssertion;
  undefined: ChaiAssertion;
  exist: ChaiAssertion;
  empty: ChaiAssertion;
  equal(val: unknown, msg?: string): ChaiAssertion;
  equals(val: unknown, msg?: string): ChaiAssertion;
  eq(val: unknown, msg?: string): ChaiAssertion;
  eql(val: unknown, msg?: string): ChaiAssertion;
  above(val: number, msg?: string): ChaiAssertion;
  gt(val: number, msg?: string): ChaiAssertion;
  below(val: number, msg?: string): ChaiAssertion;
  lt(val: number, msg?: string): ChaiAssertion;
  least(val: number, msg?: string): ChaiAssertion;
  most(val: number, msg?: string): ChaiAssertion;
  within(start: number, finish: number, msg?: string): ChaiAssertion;
  include(val: unknown, msg?: string): ChaiAssertion;
  includes(val: unknown, msg?: string): ChaiAssertion;
  contain(val: unknown, msg?: string): ChaiAssertion;
  contains(val: unknown, msg?: string): ChaiAssertion;
  match(re: RegExp, msg?: string): ChaiAssertion;
  property(name: string, val?: unknown, msg?: string): ChaiAssertion;
  keys(...args: string[]): ChaiAssertion;
  throw(msg?: string): ChaiAssertion;
  throws(msg?: string): ChaiAssertion;
  satisfy(matcher: (val: unknown) => boolean, msg?: string): ChaiAssertion;
  length(val: number, msg?: string): ChaiAssertion;
  lengthOf(val: number, msg?: string): ChaiAssertion;
  string(str: string, msg?: string): ChaiAssertion;
  instanceof(type: unknown, msg?: string): ChaiAssertion;
  instanceOf(type: unknown, msg?: string): ChaiAssertion;
  a(type: string, msg?: string): ChaiAssertion;
  an(type: string, msg?: string): ChaiAssertion;
}

declare const expect: ChaiExpect;
declare const console: QuestConsole;
declare const signal: AbortSignal;
declare function require(module: 'chai'): unknown;
declare function require(module: 'lodash'): unknown;
declare function require(module: 'moment'): QuestMomentStatic;
