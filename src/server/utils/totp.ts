import crypto from 'crypto';
import QRCode from 'qrcode';

/**
 * Standard RFC 4648 Base32 alphabet
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a buffer into a Base32 string (without padding)
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode a Base32 string into a Buffer
 */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate a cryptographically secure 20-byte Base32 secret for TOTP (160 bits)
 */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Generate a 6-digit TOTP code for a given secret at a specific counter step
 */
export function generateTotpCode(secret: string, timeStepMs = 30000, timestamp = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / timeStepMs);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

  // Dynamic truncation (RFC 4226)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify a user-supplied 6-digit code with +/- 1 time step tolerance (30 seconds drift)
 */
export function verifyTotpCode(secret: string, code: string, timeStepMs = 30000, timestamp = Date.now()): boolean {
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) return false;

  for (let step = -1; step <= 1; step++) {
    const candidate = generateTotpCode(secret, timeStepMs, timestamp + step * timeStepMs);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) {
      return true;
    }
  }

  return false;
}

/**
 * Format standard otpauth:// URI for Authenticator apps
 */
export function getTotpAuthUri(usernameOrEmail: string, secret: string, issuer = 'VanillaDatabase'): string {
  const label = encodeURIComponent(`${issuer}:${usernameOrEmail}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Robust standard QR Code Data URL generator using standard QRCode library
 * Generates high-contrast valid 2D SVG barcode scanable by Google Authenticator and Authy.
 */
export async function generateQrCodeSvgDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

