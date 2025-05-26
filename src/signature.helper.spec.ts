import {
  validateSignature,
  serializeQueryParams,
  validateObjectSignature,
} from './signature.helper';
import * as crypto from 'crypto';

describe('serializeQueryParams', () => {
  it('serializes an object to JSON with sorted keys', () => {
    const obj = { b: 2, a: 1 };
    expect(serializeQueryParams(obj)).toBe('{"a":1,"b":2}');
  });

  it('handles nested objects (sorts only top-level keys)', () => {
    const obj = { z: 1, a: { y: 2, x: 1 } };
    expect(serializeQueryParams(obj)).toBe('{"a":{"y":2,"x":1},"z":1}');
  });

  it('handles empty objects', () => {
    expect(serializeQueryParams({})).toBe('{}');
  });

  it('produces deterministic output for different key orders', () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };
    expect(serializeQueryParams(obj1)).toBe(serializeQueryParams(obj2));
  });
});

describe('validateSignature', () => {
  const secret = 'test-secret';
  const params = { foo: 'bar', baz: 42 };
  const payload = serializeQueryParams(params);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const toSign = `${payload}.${timestamp}`;
  const validSig = crypto.createHmac('sha256', secret).update(toSign).digest('hex');

  it('returns true for a valid signature and timestamp', () => {
    expect(validateSignature(payload, timestamp, validSig, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(validateSignature(payload, timestamp, 'bad' + validSig.slice(3), secret)).toBe(false);
  });

  it('returns false for an expired timestamp', () => {
    const oldTs = (parseInt(timestamp) - 10000).toString();
    const oldSig = crypto.createHmac('sha256', secret).update(`${payload}.${oldTs}`).digest('hex');
    expect(validateSignature(payload, oldTs, oldSig, secret)).toBe(false);
  });

  it('returns false for a malformed timestamp', () => {
    expect(validateSignature(payload, 'not-a-timestamp', validSig, secret)).toBe(false);
  });

  it('returns false for a signature that is almost correct (timing safe)', () => {
    const almost = validSig.slice(0, -1) + (validSig.slice(-1) === 'a' ? 'b' : 'a');
    expect(validateSignature(payload, timestamp, almost, secret)).toBe(false);
  });

  it('works with serializeQueryParams + validateSignature for OfficeRnD-style check', () => {
    const params = { slug: 'test-slug', locations: 'loc1,loc2' };
    const payload = serializeQueryParams(params);
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = crypto.createHmac('sha256', secret).update(`${payload}.${ts}`).digest('hex');
    expect(validateSignature(payload, ts, sig, secret)).toBe(true);
  });
});

describe('validateObjectSignature', () => {
  const secret = 'test-secret';
  const obj = { foo: 'bar', baz: 42 };
  const payload = serializeQueryParams(obj);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const toSign = `${payload}.${timestamp}`;
  const validSig = crypto.createHmac('sha256', secret).update(toSign).digest('hex');

  it('returns true for a valid object signature', () => {
    expect(validateObjectSignature(obj, timestamp, validSig, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(validateObjectSignature(obj, timestamp, 'bad' + validSig.slice(3), secret)).toBe(false);
  });

  it('returns false for an expired timestamp', () => {
    const oldTs = (parseInt(timestamp) - 10000).toString();
    const oldSig = crypto.createHmac('sha256', secret).update(`${payload}.${oldTs}`).digest('hex');
    expect(validateObjectSignature(obj, oldTs, oldSig, secret)).toBe(false);
  });

  it('returns false for a malformed timestamp', () => {
    expect(validateObjectSignature(obj, 'not-a-timestamp', validSig, secret)).toBe(false);
  });

  it('returns false for a signature that is almost correct', () => {
    const almost = validSig.slice(0, -1) + (validSig.slice(-1) === 'a' ? 'b' : 'a');
    expect(validateObjectSignature(obj, timestamp, almost, secret)).toBe(false);
  });
});
