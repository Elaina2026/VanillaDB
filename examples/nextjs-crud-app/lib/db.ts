import { VanillaDatabase } from '@elaina2026/vanilladb';

export const db = new VanillaDatabase({
  url: process.env.VANILLA_DB_URL || 'http://localhost:3000/v1/databases/db_nextjs_demo',
  token: process.env.VANILLA_DB_TOKEN || 'vdb_live_your_token_here'
});
