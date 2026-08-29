import crypto from 'crypto';
import fs from 'fs';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const MAGIC_HEADER = Buffer.from('VENC'); // Vanilla Encryption Signature (4 bytes)

/**
 * Encrypt a buffer or string using AES-256-GCM.
 * Output format: [MAGIC(4B)][SALT(16B)][IV(12B)][TAG(16B)][CIPHERTEXT]
 */
export function encryptBuffer(data: Buffer | string, customKey?: Buffer): Buffer {
  const plainBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const key = customKey || (config.derivedEncryptionKey as Buffer);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_HEADER, salt, iv, tag, encrypted]);
}

/**
 * Decrypt a buffer encrypted with encryptBuffer.
 */
export function decryptBuffer(encryptedBuffer: Buffer, customKey?: Buffer): Buffer {
  if (encryptedBuffer.length < MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted data payload is too short');
  }

  // Verify magic header
  const magic = encryptedBuffer.subarray(0, 4);
  if (!magic.equals(MAGIC_HEADER)) {
    // If not matching our custom envelope, might be legacy or raw unencrypted
    throw new Error('Invalid encryption envelope magic signature');
  }

  let offset = 4;
  const _salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const tag = encryptedBuffer.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;

  const ciphertext = encryptedBuffer.subarray(offset);

  const key = customKey || (config.derivedEncryptionKey as Buffer);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypts an input file path to a target encrypted file path on disk.
 */
export function encryptFile(sourcePath: string, targetPath: string, key?: Buffer): void {
  const plain = fs.readFileSync(sourcePath);
  const encrypted = encryptBuffer(plain, key);
  fs.writeFileSync(targetPath, encrypted);
}

/**
 * Decrypts an encrypted file path to a target plaintext file path on disk.
 */
export function decryptFile(encryptedPath: string, targetPath: string, key?: Buffer): void {
  const encBuffer = fs.readFileSync(encryptedPath);
  const decrypted = decryptBuffer(encBuffer, key);
  fs.writeFileSync(targetPath, decrypted);
}

/**
 * Check if a file starts with the VENC encryption signature.
 */
export function isEncryptedFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    return header.equals(MAGIC_HEADER);
  } catch {
    return false;
  }
}

/**
 * Derive encryption key from arbitrary string (e.g. user-supplied key for SQL helper functions).
 */
export function deriveKeyFromString(passphrase: string): Buffer {
  return crypto.pbkdf2Sync(passphrase, 'vdb_user_sql_salt', 10000, 32, 'sha256');
}
