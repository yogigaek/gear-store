import { randomInt } from 'node:crypto';
import { jakartaIso } from '../common/time.js';

// no 0/O, 1/I/L: an order number gets read out over the phone
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** RKT-YYMMDD-XXXXXX in Jakarta time: readable, sortable by day, and not guessable from its neighbours. */
export function newOrderNumber(now = new Date()): string {
  const day = jakartaIso(now).slice(2, 10).replaceAll('-', '');
  const suffix = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `RKT-${day}-${suffix}`;
}
