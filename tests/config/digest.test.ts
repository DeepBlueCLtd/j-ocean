import { describe, expect, it } from 'vitest';
import { canonicalise, digestOf, sha256 } from '../../src/config/digest.js';

describe('sha256', () => {
  // RFC 6234 / FIPS 180-4 vectors. Written out rather than generated, so that a future
  // change to the implementation is checked against the standard and not against itself.
  it('matches the published vectors', () => {
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('handles a message that crosses a block boundary', () => {
    expect(sha256('a'.repeat(1_000_000)).length).toBe(64);
    expect(sha256('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
  });
});

describe('canonicalise', () => {
  it('orders object keys and drops insignificant whitespace', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalise({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('keeps array order, because array order is meaning', () => {
    expect(canonicalise([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalise([1, 2, 3])).not.toBe(canonicalise([3, 2, 1]));
  });

  it('refuses a value it cannot serialise faithfully', () => {
    expect(() => canonicalise(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalise(() => undefined)).toThrow(/function/);
  });
});

describe('digestOf', () => {
  const config = { grid: { nx: 100, ny: 100 }, horizons: [0, 24, 48] };

  it('is unchanged by key order or by reformatting', () => {
    const reordered = { horizons: [0, 24, 48], grid: { ny: 100, nx: 100 } };
    expect(digestOf(reordered)).toBe(digestOf(config));
    expect(digestOf(JSON.parse(JSON.stringify(config, null, 4)))).toBe(digestOf(config));
  });

  it('changes whenever a value changes', () => {
    expect(digestOf({ ...config, grid: { nx: 101, ny: 100 } })).not.toBe(digestOf(config));
    expect(digestOf({ ...config, horizons: [0, 24, 49] })).not.toBe(digestOf(config));
  });

  it('distinguishes an absent member from a present one', () => {
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: 1, b: 1 }));
    expect(digestOf({ a: 1, b: undefined })).toBe(digestOf({ a: 1 }));
  });
});
