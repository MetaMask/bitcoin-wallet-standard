import type { SessionData } from '@metamask/multichain-api-client';
import type { CaipAccountId } from './types/common';

/**
 * Decoded JWT token structure returned by {@link decodeToken}.
 */
export type DecodedToken = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
};

/**
 * Decodes an unsecured JWT token (base64url-encoded) into its header, payload, and signature parts.
 * This is a lightweight replacement for the deprecated `jsontokens` library's `decodeToken`.
 * Only used to decode legacy SatsConnect JWT-encoded requests.
 *
 * @param token - The JWT token string to decode.
 * @returns The decoded token with header, payload, and signature.
 */
export function decodeToken(token: string): DecodedToken {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token: expected 3 parts.');
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = JSON.parse(base64UrlDecode(headerB64));
  const payload = JSON.parse(base64UrlDecode(payloadB64));

  return { header, payload, signature: signatureB64 };
}

/**
 * Decodes a base64url-encoded string to a UTF-8 string.
 *
 * @param input - The base64url-encoded string to decode.
 * @returns The decoded UTF-8 string.
 */
function base64UrlDecode(input: string): string {
  // Replace base64url characters with base64 equivalents and add padding
  const base64 = input.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

/**
 * A regex to validate and parse a CAIP-10 account ID.
 */
export const CAIP_ACCOUNT_ID_REGEX =
  /^(?<chainId>(?<namespace>[-a-z0-9]{3,8}):(?<reference>[-_a-zA-Z0-9]{1,32})):(?<accountAddress>[-.%a-zA-Z0-9]{1,128})$/u;

/**
 * Validates and parses a CAIP-10 account ID.
 *
 * @param caipAccountId - The CAIP-10 account ID to validate and parse.
 * @returns The CAIP-10 address.
 */
export function getAddressFromCaipAccountId(caipAccountId: CaipAccountId) {
  const match = CAIP_ACCOUNT_ID_REGEX.exec(caipAccountId);

  if (!match?.groups?.accountAddress) {
    throw new Error('Invalid CAIP account ID.');
  }

  return match.groups.accountAddress!;
}

/**
 * Checks if the given event is a session changed event.
 * @param event - The event to check.
 * @returns True if the event is a session changed event, false otherwise.
 */
export function isSessionChangedEvent(event: any): event is {
  method: 'wallet_sessionChanged';
  params: SessionData;
} {
  return event?.method === 'wallet_sessionChanged' && typeof event?.params === 'object';
}

/**
 * Reverses a mapping object.
 * @param map - The mapping object to reverse.
 * @returns The reversed mapping object.
 */
export const reverseMapping = <
  From extends string | number | symbol,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  To extends string | number | symbol,
>(
  map: Record<From, To>,
): Record<To, From> => Object.fromEntries(Object.entries(map).map(([from, to]) => [to, from]));
