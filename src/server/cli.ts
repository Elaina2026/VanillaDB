import { authService } from './services/auth.js';
import { getMetadataDb, closeMetadataDb } from './db/metadata.js';

async function resetPassword() {
  const args = process.argv.slice(2);
  const username = args[0] || 'admin';
  const password = args[1] || 'admin123456';

  const metaDb = getMetadataDb();
  const existing = metaDb.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | undefined;

  const hash = await authService.hashPassword(password);
  const now = Date.now();

  if (existing) {
    metaDb.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, existing.id);
    console.log(`\n✓ Password for user "${username}" has been reset successfully.`);
  } else {
    metaDb.prepare('INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      `usr_${Date.now()}`,
      username,
      hash,
      now,
      now
    );
    console.log(`\n✓ Admin user "${username}" has been created successfully.`);
  }

  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}\n`);

  closeMetadataDb();
}

resetPassword().catch(console.error);
