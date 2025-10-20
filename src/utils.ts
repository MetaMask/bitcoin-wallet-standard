import type { CaipAccountId } from './types/common';

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
 * Checks if the given event is an account changed event.
 * @param event - The event to check.
 * @returns True if the event is an account changed event, false otherwise.
 */
export function isAccountChangedEvent(event: any) {
  return event.params?.notification?.method === 'metamask_accountsChanged';
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
