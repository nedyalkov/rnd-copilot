import { createHmac, timingSafeEqual } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { omit, omitBy, isUndefined } from 'lodash';

/**
 * Serializes query parameters into a JSON string with sorted keys.
 * @param params The object to serialize
 * @returns JSON string with sorted keys
 */
export function serializeQueryParams(params: Record<string, unknown>): string {
  return JSON.stringify(params);
}

/**
 * Checks if the provided signature matches the HMAC of the payload and timestamp.
 * Does NOT check timestamp validity or maxAge.
 * @param payload The raw request body as a string
 * @param timestamp The timestamp from the header (string or number)
 * @param signature The signature from the header
 * @param secret The webhook secret
 * @returns true if the signature matches, false otherwise
 */
export function validateSignature(
  payload: string,
  timestamp: string | number,
  signature: string,
  secret: string,
): boolean {
  const toSign = `${payload}.${timestamp}`;
  const expected = createHmac('sha256', secret).update(toSign).digest('hex');
  // Timing-safe compare
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Validates the signature for an object using OfficeRnD rules (serializes and checks signature).
 * @param obj The object to serialize and validate
 * @param timestamp The timestamp from the header (string or number)
 * @param signature The signature from the header
 * @param secret The webhook secret
 * @returns true if valid, false otherwise
 */
export function validateObjectSignature(
  obj: Record<string, unknown>,
  timestamp: string | number,
  signature: string,
  secret: string,
): boolean {
  return validateSignature(serializeQueryParams(obj), timestamp, signature, secret);
}

/**
 * Parses and validates the OfficeRnD signature string, timestamp, and payload.
 * Throws BadRequestException on error.
 * @param query The DTO/query object
 * @param signatureString The signature string (e.g. 't=timestamp,signature=hex')
 * @param secret The integration secret
 */
export function parseAndValidateSignature(
  query: Record<string, unknown>,
  signatureString: string,
  secret: string,
  maxAgeSec = 300,
): void {
  // Parse signature string: expected format 't=timestamp,signature=hex'
  const [timestampStr, signatureStr] = (signatureString ?? '')
    .split(',')
    .map((segment) => segment.split('=')[1]);
  if (!timestampStr || !signatureStr) {
    throw new BadRequestException(
      'The request is not signed. Make sure you send the "signature" query parameter',
    );
  }
  // Validate timestamp
  const timestampNum = Number(timestampStr);
  if (!isFinite(timestampNum)) {
    throw new BadRequestException('Invalid timestamp');
  }
  const nowTimestamp = Math.round(new Date().getTime() / 1000);
  const diff = nowTimestamp - timestampNum;
  if (diff < 0) {
    throw new BadRequestException(`Invalid timestamp (diff in future: ${diff})`);
  }
  if (diff > maxAgeSec) {
    throw new BadRequestException('Signature expired');
  }

  if (!validateObjectSignature(query, timestampStr, signatureStr, secret)) {
    throw new BadRequestException('Invalid signature');
  }
}
