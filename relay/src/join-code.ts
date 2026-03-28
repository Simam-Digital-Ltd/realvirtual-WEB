/**
 * join-code.ts — 6-character alphanumeric join code generator.
 *
 * Codes are uppercase A-Z + digits 0-9 (36 chars alphabet).
 * Collision probability is negligible for typical session counts:
 * 36^6 = ~2.17 billion unique codes.
 *
 * The generator is purely functional and stateless — collision
 * avoidance is the caller's responsibility (see RoomManager.createRoom).
 */

/** Alphabet used for join code generation: uppercase letters + digits. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Length of generated join codes. */
export const JOIN_CODE_LENGTH = 6;

/**
 * Generate a random 6-character alphanumeric join code.
 *
 * Uses Math.random() which is sufficient for non-security-critical
 * session identifiers. For cryptographic use, replace with
 * crypto.getRandomValues().
 *
 * @returns Uppercase alphanumeric string of length JOIN_CODE_LENGTH.
 */
export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
