import * as bcrypt from 'bcryptjs';

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_ROUNDS = 10;

export function hashUserPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyUserPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
