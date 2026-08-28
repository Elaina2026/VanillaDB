import os
import time
import requests
from telebot import TeleBot
from vanilladb import VanillaDatabase

# 1. Initialize VanillaDB Client
DB_URL = os.getenv("VANILLA_DB_URL", "http://localhost:3000/v1/databases/db_telegram_bot")
DB_TOKEN = os.getenv("VANILLA_DB_TOKEN", "vdb_live_your_token_here")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "your_telegram_bot_token")

db = VanillaDatabase(url=DB_URL, token=DB_TOKEN)
bot = TeleBot(BOT_TOKEN)

# 2. Initialize Database Schema
def init_db():
    db.query("""
        CREATE TABLE IF NOT EXISTS telegram_users (
            chat_id INTEGER PRIMARY KEY,
            username TEXT,
            photo_file_id TEXT,
            joined_at INTEGER NOT NULL
        );
    """)
    print("Telegram bot database initialized.")

# 3. /start Command
@bot.message_handler(commands=['start'])
def handle_start(message):
    chat_id = message.chat.id
    username = message.chat.username or message.chat.first_name

    db.query("""
        INSERT INTO telegram_users (chat_id, username, joined_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET username = ?
    """, [chat_id, username, int(time.time()), username])

    bot.reply_to(message, f"👋 Xin chào {username}! Gửi một hình ảnh để bot lưu vào VanillaDatabase media storage.")

# 4. Handle Image Upload to VanillaDB Media Storage
@bot.message_handler(content_types=['photo'])
def handle_photo(message):
    photo = message.photo[-1]
    file_info = bot.get_file(photo.file_id)
    file_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_info.file_path}"

    # Download image bytes
    res = requests.get(file_url)
    if res.status_code == 200:
        filename = f"user_{message.chat.id}_{int(time.time())}.jpg"
        uploaded = db.upload_file(res.content, filename=filename, content_type="image/jpeg")

        # Save reference in database
        db.query("UPDATE telegram_users SET photo_file_id = ? WHERE chat_id = ?", [uploaded["id"], message.chat.id])

        stream_url = db.get_file_url(uploaded["id"])
        bot.reply_to(message, f"✅ Đã lưu ảnh vào VanillaDB Media Storage!\n\n🆔 File ID: `{uploaded['id']}`\n🔗 Stream URL: {stream_url}", parse_mode="Markdown")
    else:
        bot.reply_to(message, "❌ Không thể tải ảnh từ Telegram.")

if __name__ == '__main__':
    init_db()
    print("Bot is polling...")
    bot.infinity_polling()
