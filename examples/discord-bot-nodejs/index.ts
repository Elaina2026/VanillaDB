import { Client, GatewayIntentBits } from 'discord.js';
import { VanillaDatabase } from '@nullex/vanilladb';

// 1. Initialize VanillaDB Client
const db = new VanillaDatabase({
  url: process.env.VANILLA_DB_URL || 'http://localhost:3000/v1/databases/db_discord_bot',
  token: process.env.VANILLA_DB_TOKEN || 'vdb_live_your_token_here'
});

// 2. Setup SQLite tables on startup
async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      exp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      coins INTEGER DEFAULT 100,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (discord_id) REFERENCES users(discord_id) ON DELETE CASCADE
    );
  `);
  console.log('VanillaDatabase tables initialized successfully.');
}

// 3. Realtime Listener: Log level ups or inventory changes live
db.subscribe((event) => {
  console.log(`[Realtime Event] Table: ${event.table} | Type: ${event.type}`);
}, 'users');

// 4. Initialize Discord Bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', async () => {
  console.log(`Bot logged in as ${client.user?.tag}!`);
  await initDatabase();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const discordId = message.author.id;
  const username = message.author.username;

  // Command: !profile
  if (message.content === '!profile') {
    const res = await db.query('SELECT * FROM users WHERE discord_id = ?', [discordId]);
    if (res.rows.length === 0) {
      return message.reply('You do not have a profile yet! Send some messages to earn EXP.');
    }
    const user = res.rows[0];
    return message.reply(`👤 **${user.username}** | 🌟 Level: ${user.level} | 📈 EXP: ${user.exp} | 💰 Coins: ${user.coins}`);
  }

  // Command: !daily (Batch Transaction)
  if (message.content === '!daily') {
    try {
      await db.batch([
        {
          sql: `
            INSERT INTO users (discord_id, username, coins, updated_at)
            VALUES (?, ?, 200, ?)
            ON CONFLICT(discord_id) DO UPDATE SET coins = coins + 200, updated_at = ?
          `,
          params: [discordId, username, Date.now(), Date.now()]
        },
        {
          sql: 'INSERT INTO inventory (discord_id, item_name, quantity) VALUES (?, ?, 1)',
          params: [discordId, 'Daily Mystery Box']
        }
      ], true);

      return message.reply('🎁 You claimed 200 coins and 1x Daily Mystery Box!');
    } catch (err: any) {
      return message.reply(`Error claiming daily: ${err.message}`);
    }
  }

  // Auto EXP on message
  await db.query(`
    INSERT INTO users (discord_id, username, exp, updated_at)
    VALUES (?, ?, 10, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      exp = exp + 10,
      level = (exp + 10) / 100 + 1,
      updated_at = ?;
  `, [discordId, username, Date.now(), Date.now()]);
});

client.login(process.env.DISCORD_BOT_TOKEN);
