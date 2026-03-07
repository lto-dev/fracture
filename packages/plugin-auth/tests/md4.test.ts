// MD4 implementation verification against RFC 1320 test vectors.
// This validates that the pure-JS MD4 used for NTLM NTHash computation is correct.
import { describe, test, expect } from 'vitest';
import { md4 } from '../src/ntlm-auth.js';

// RFC 1320 Section 5 — Test vectors
// Format: MD4(input) = expected_hex
const RFC1320_VECTORS: Array<[string, string]> = [
  ['', '31d6cfe0d16ae931b73c59d7e0c089c0'],
  ['a', 'bde52cb31de33e46245e05fbdbd6fb24'],
  ['abc', 'a448017aaf21d8525fc10ae87aa6729d'],
  ['message digest', 'd9130a8164549fe818874806e1c7014b'],
  ['abcdefghijklmnopqrstuvwxyz', 'd79e1c308aa5bbcdeea8ed63df412da9'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', '043f8582f241db351ce627e153e7f0e4'],
  [
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    'e33b4ddc9c38f2199c3e7b164fcc0536'
  ]
];

describe('MD4 — RFC 1320 test vectors', () => {
  for (const [input, expected] of RFC1320_VECTORS) {
    test(`MD4("${input.length > 40 ? input.slice(0, 20) + '...' : input}") === ${expected}`, () => {
      const result = md4(Buffer.from(input, 'ascii'));
      expect(result.toString('hex')).toBe(expected);
    });
  }
});

describe('MD4 — NTLM NTHash known-good values', () => {
  test('NTHash of "Password" matches Microsoft NTLM test vector', () => {
    // MD4(UTF-16LE("Password"))
    // Published Microsoft NTLM test vector from MS-NLMP specification.
    // Hex: a4f49c406510bdcab6824ee7c30fd852
    const password = 'Password';
    const utf16le = Buffer.from(
      password.split('').flatMap(c => [c.charCodeAt(0), 0])
    );
    const ntHash = md4(utf16le);
    expect(ntHash.toString('hex')).toBe('a4f49c406510bdcab6824ee7c30fd852');
  });

  test('NTHash of empty string produces correct MD4', () => {
    // MD4(UTF-16LE("")) = MD4(empty buffer) = 31d6cfe0d16ae931b73c59d7e0c089c0
    const ntHash = md4(Buffer.alloc(0));
    expect(ntHash.toString('hex')).toBe('31d6cfe0d16ae931b73c59d7e0c089c0');
  });

  test('MD4 output is always 16 bytes regardless of input length', () => {
    expect(md4(Buffer.from('')).length).toBe(16);
    expect(md4(Buffer.from('short')).length).toBe(16);
    expect(md4(Buffer.from('a'.repeat(1000))).length).toBe(16);
  });
});
