import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const createOpaqueToken = () => randomBytes(32).toString('hex');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, keyHex] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const derived = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_OPTIONS));
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
