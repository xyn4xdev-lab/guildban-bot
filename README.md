# 🌐 Global Guild Moderation Bot

A powerful **Discord moderation bot** that synchronizes **bans and mutes across multiple servers**. Designed for moderation teams managing multiple communities with a **single source of truth**.

---

## ⚙️ Features

* 🌍 **Global Ban** – Ban a user across all synced servers
* 🔇 **Global Mute** – Timeout a user across all synced servers
* 🔊 **Global Unmute** – Remove timeouts everywhere
* ♻️ **Global Unban** – Unban a user from all servers
* 🔄 **Sync Status Command** – Check permissions & connection health
* 👮 **Role-based access control** (Moderator role support)
* 🧾 **Modlog logging** (optional)
* ⏱️ **Automatic unmute handling** after timeout expiry
* ⚡ Built with **Discord.js v14**

---

## 🛠️ Installation

```bash
git clone https://github.com/xyn4xdev-lab/guildban-bot.git
cd guildban-bot
npm install
```

### Required Packages

```bash
npm install discord.js @discordjs/rest discord-api-types dotenv
```

---

## 🔧 Setup

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Fill in your `.env` file:

```env
BOT_TOKEN=your_bot_token_here

# Bot application client ID
CLIENT_ID=your_bot_client_id_here

# Main (primary) server ID
MAIN_SERVER_ID=your_main_server_id_here

# Servers where bans & mutes should sync (comma separated)
SYNC_SERVERS=server_id_1,server_id_2,server_id_3

# Optional: Channel ID for logging all actions
MODLOG_CHANNEL_ID=your_modlog_channel_id_here

# Optional: Role required to use global commands
MODERATOR_ROLE_ID=your_moderator_role_id_here
```

---

## 🚀 Slash Commands

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `/global ban`    | Ban a user from all synced servers |
| `/global mute`   | Mute (timeout) a user everywhere   |
| `/global unmute` | Remove mute globally               |
| `/global unban`  | Unban a user globally              |
| `/sync status`   | Check sync and permission status   |

---

## 🧠 How It Works

* The bot **listens for moderation commands** in approved servers
* When a command is executed:

  * The action is applied across **all synced servers**
  * Permissions are verified **per server**
  * Results are summarized in a **single embed**
* Mutes automatically expire and are **auto-unmuted**
* All actions can be logged to a **modlog channel**

---

## 🔐 Permissions Required

Make sure the bot has the following permissions in **all synced servers**:

* `Ban Members`
* `Moderate Members`
* `View Channels`
* `Send Messages`
* `Embed Links`

---

## ▶️ Run the Bot

```bash
node bot.js
```

When online, the bot will display:

```
Watching X servers
```

---

## 📋 Notes

* Requires **Node.js v16+**
* Uses **Discord.js v14**
* Commands are registered **globally**

  * May take up to **1 hour** to appear on first deploy
* If `MODERATOR_ROLE_ID` is not set, permission fallback is:

  * `Moderate Members`

---

## 📜 License

This project is open source and available under the
**Creative Commons Attribution-NonCommercial 4.0 International License**.
