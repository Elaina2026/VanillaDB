import './suppressWarnings.js';
import { authService } from './services/auth.js';
import { getMetadataDb, closeMetadataDb } from './db/metadata.js';

async function resetPassword() {
  const args = process.argv.slice(2);
  const keep2fa = args.includes('--keep-2fa');
  const nonFlagArgs = args.filter(a => !a.startsWith('--'));
  const username = nonFlagArgs[0] || 'admin';
  const password = nonFlagArgs[1] || 'admin123456';

  const metaDb = getMetadataDb();
  const existing = metaDb.prepare('SELECT id, totp_enabled FROM users WHERE username = ?').get(username) as { id: string; totp_enabled: number } | undefined;

  const hash = await authService.hashPassword(password);
  const now = Date.now();

  if (existing) {
    if (keep2fa) {
      metaDb.prepare(`
        UPDATE users
        SET password_hash = ?, token_version = token_version + 1, last_totp_step = -1, updated_at = ?
        WHERE id = ?
      `).run(hash, now, existing.id);
      console.log(`\n✓ Password for user "${username}" has been reset successfully (2FA kept enabled).`);
    } else {
      metaDb.prepare(`
        UPDATE users
        SET password_hash = ?, totp_enabled = 0, totp_secret = NULL, totp_temp_secret = NULL, totp_backup_codes = NULL, last_totp_step = -1, token_version = token_version + 1, updated_at = ?
        WHERE id = ?
      `).run(hash, now, existing.id);
      console.log(`\n✓ Password for user "${username}" has been reset and 2FA has been disabled.`);
    }
  } else {
    metaDb.prepare(`
      INSERT INTO users (id, username, password_hash, role, token_version, last_totp_step, created_at, updated_at)
      VALUES (?, ?, ?, 'super_admin', 1, -1, ?, ?)
    `).run(
      `usr_${Date.now()}`,
      username,
      hash,
      now,
      now
    );
    console.log(`\n✓ Super Admin user "${username}" has been created successfully.`);
  }

  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}\n`);

  closeMetadataDb();
}

resetPassword().catch(console.error);
