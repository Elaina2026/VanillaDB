import '../src/server/suppressWarnings.js';
import { describe, it, expect } from 'vitest';
import { encryptBuffer, decryptBuffer, deriveKeyFromString } from '../src/server/utils/crypto.js';

describe('Data-at-Rest AES-256-GCM Cryptography', () => {
  it('should encrypt and decrypt string payload accurately with master key', () => {
    const secretMessage = 'VanillaDatabase Secure At-Rest Payload 2026';
    const encrypted = encryptBuffer(secretMessage);
    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.subarray(0, 4).toString('utf-8')).toBe('VENC');
    expect(encrypted.toString('utf-8')).not.toContain(secretMessage);

    const decrypted = decryptBuffer(encrypted);
    expect(decrypted.toString('utf-8')).toBe(secretMessage);
  });

  it('should encrypt and decrypt binary buffer payload accurately', () => {
    const rawBinary = Buffer.from([0x00, 0xff, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]);
    const encrypted = encryptBuffer(rawBinary);
    const decrypted = decryptBuffer(encrypted);
    expect(decrypted.equals(rawBinary)).toBe(true);
  });

  it('should support custom user-provided passphrase derivation', () => {
    const userPassphrase = 'MyCustomSuperSecretKey456!';
    const userKey = deriveKeyFromString(userPassphrase);
    expect(userKey.length).toBe(32);

    const plain = 'User credit card data 4111-2222-3333-4444';
    const encrypted = encryptBuffer(plain, userKey);
    const decrypted = decryptBuffer(encrypted, userKey);
    expect(decrypted.toString('utf-8')).toBe(plain);
  });

  it('should throw on corrupted ciphertext or modified auth tag', () => {
    const message = 'Authenticated Payload';
    const encrypted = encryptBuffer(message);

    // Tamper with one byte in the ciphertext
    encrypted[encrypted.length - 1] ^= 0x55;

    expect(() => {
      decryptBuffer(encrypted);
    }).toThrow();
  });
});
