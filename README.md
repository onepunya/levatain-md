<p align="center">
  <img src="https://raw.githubusercontent.com/onepunya/animes/refs/heads/main/watermark-removed-47041.png" alt="Levatain-MD Banner" width="100%">
</p>

# Levatain-MD

AI-first WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys) (Node.js, ESM). Besides regular prefixed commands, this bot has an **intent engine** — an AI that reads natural chat (no prefix) and automatically routes it to the matching plugin.

## Folder Structure

```
.
├── index.js              Entry point — WhatsApp connection, pairing, main event handlers
├── package.json          Dependency list & npm scripts
├── .env.example          Environment variable template (copy to .env)
├── src/
│   ├── config.js         All environment variables are read from here (single source of truth)
│   ├── globals.js        All `global.*` state (owner, plugins, api, etc.) is initialized here once
│   ├── handler.js        Incoming message router → detects prefix/command → plugin, or hands off to AI
│   ├── ai/               Intent engine (engine.js), group trigger-word gate (gate.js), conversation memory
│   ├── core/             Plugin auto-scan loader (loader.js) & local database (db.js)
│   └── lib/              Helpers, barreled through lib/index.js — just `import { x, y } from '.../lib/index.js'`
│       ├── index.js      Barrel — re-exports all the helpers below
│       ├── utils.js, logger.js, menuCatalog.js   Generic helpers used across modules
│       ├── api/          External API wrappers: LLM (llm.js), TTS (voice.js), downloaders/images (media.js), http.js (shared curl helper), youtube/giphy/boppy/photiu/iplookup
│       ├── wa/            WhatsApp layer: interactive messages, rich message cards, progress bar, group cache, session, device detection
│       ├── media/         Media file processing: audio effects, media size limits
│       └── dashboard/     Admin web dashboard (server + static client)
└── plugins/              All bot commands, grouped by category, auto-loaded by the loader
    ├── main/             menu, ping, sc (script/source)
    ├── ai/                chat, imagine (text-to-image), editimage, musicgen, memory
    ├── audiochanger/     Audio effects: bassboost, nightcore, reverb, reverse, 8d, etc. (uses ffmpeg)
    ├── download/         Downloaders: TikTok, YouTube, Instagram, Facebook, Twitter/X, Pinterest, etc.
    ├── fun/               Group entertainment/game features: tod, impostor, tembak, pilihacak
    ├── group/            Group features: tagall, warn (strike system), add, groupset, afk, etc.
    ├── owner/            Owner-only commands (mode, system, dashboard, eval)
    └── tools/            Utilities: sticker, upscale, removebg, toimg, tourl, gempa
```

## How Commands Work

The bot supports two ways of invoking a command at once:

1. **Regular prefix** — type any symbol (`.`, `!`, `#`, etc.) followed by the command name, e.g. `.tiktok <url>`.
2. **Natural language (AI intent engine)** — type an ordinary sentence with no prefix, e.g. *"download this tiktok for me"* or *"make a sticker from this photo"*. The AI (`src/ai/engine.js`) reads the plugin list along with its `ai.trigger`/`ai.examples` metadata, then decides which command best matches and runs it automatically.

**Inside groups specifically**, the AI (chat or intent engine) only activates if one of the following is met (`src/ai/gate.js`):
- The message contains a trigger word: `lev` / `levatain` / `leva`
- The bot is mentioned
- The message replies/quotes a bot message

This keeps the bot from jumping into every conversation in the group.

## Requirements

- **Node.js** version 20 or above
- **ffmpeg** must be installed on the system (not just the npm package) — used for the audio changer and media conversion features
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Check it's installed: `ffmpeg -version`

## Environment Variable Configuration

All configuration goes through the `.env` file (never committed to the repo, already in `.gitignore`).

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:
- `PAIRING_NUMBER` — the WA number you want to turn into the bot (format `628xxxxxxxxxx`, no `+`)
- `OWNER_NUMBER` — your WA number as the owner
- At least one AI key: `GEMINI_KEY_1` (free at [Google AI Studio](https://aistudio.google.com/apikey)) or `NAGA_API_KEY`

Other variables (Giphy, OnePunya, Magic Hour, AudD/Shazam, translate, dashboard port, etc.) are optional — see the comments in `.env.example` for an explanation of each variable.

## How to Get All API Keys

All the keys below go in the `.env` file (not `.env.example`), one line per variable, in the format `VARIABLE_NAME=key-value` with no spaces/quotes.

| Key used for | Env var | How to get it |
|---|---|---|
| AI chat & intent engine (primary) | `GEMINI_KEY_1`–`GEMINI_KEY_5` | Uses a Gemini cookie, obtained via devtools. |
| AI chat (fallback) | `NAGA_API_KEY` | Join the [NagaAI](https://naga.ac/) Discord server → in the bot channel, type `/account key get` → the key is sent to you directly by the bot. Optional, only used if all Gemini keys fail/hit their limit. |
| Certain download/tools features | `ONEPUNYA_API_KEY` | OnePunya isn't a public self-signup service — it's a private/community API owned by an independent developer. Contact the owner directly via [GitHub](https://github.com/onepunya) or the contact listed there to request key access. |
| Mood/AI stickers (Giphy) | `GIPHY_API_KEY` | Open [developers.giphy.com](https://developers.giphy.com/) → **Create an App** → choose **API** (not SDK) → copy the API Key shown. |
| `.editimage` / `.aiedit` (Magic Hour) | `MAGICHOUR_KEY_1` through `MAGICHOUR_KEY_3` | Sign up at [magichour.ai](https://magichour.ai/) → go to **Dashboard** → **API Keys** menu → generate a new key. You can fill in more than one for auto-rotation. |
| `.play` song recognition (fallback) | `AUDD_API_KEY` | Sign up for free at [dashboard.audd.io](https://dashboard.audd.io/). |
| `.play` song recognition (tried first) | `SHAZAM_RAPIDAPI_KEY`, `SHAZAM_RAPIDAPI_HOST` | Sign up & subscribe (free plan available) at [RapidAPI - Shazam API](https://rapidapi.com/diyorbekkanal/api/shazam-api6). |

Once you have a key, open `.env`, paste it on the matching env var line, save, then restart the bot (`npm start` again / `pm2 restart levatain-md`).

> All the keys above are free to get started with (each provider has its own free limit/quota). Never commit a filled-in `.env` file to a public repo.

---

## Running on a Regular VPS

### 1. Install dependencies
```bash
npm install
```

### 2. Run the bot
```bash
npm start
```

There's also `npm run dev`, which runs the bot with `node --watch` (auto-restarts on every file change, handy for development).

The `npm start` process runs in the foreground and will die if the terminal/SSH session closes. To keep it alive, use one of the following:

**Option A — using `pm2` (recommended)**
```bash
npm install -g pm2
pm2 start index.js --name levatain-md
pm2 save
pm2 startup   # follow the printed instructions so the bot auto-starts on VPS reboot
```
Check logs: `pm2 logs levatain-md` · Restart: `pm2 restart levatain-md` · Stop: `pm2 stop levatain-md`

**Option B — using `screen`**
```bash
screen -S levatain-md
npm start
# press Ctrl+A then D to detach (the bot keeps running in the background)
```
Return to the session: `screen -r levatain-md`

The first time it runs, the bot will show a **pairing code** in the terminal. Open WhatsApp on your phone → **⋮ (three dots) → Linked Devices → Link with phone number** → enter that code.

---

## Running on a Pterodactyl Panel

1. **Create a new server** with the **Node.js** egg (Nodejs Generic/YSN Node.js egg or similar, minimum Node version 20).
2. **Upload the bot's source code** to the server directory (via the panel's file manager, SFTP, or `git clone` from this repo if the egg supports it).
3. **Fill in environment variables** — two options, pick one:
   - Create a `.env` file directly in the project root (upload its contents manually, or fill it in from `.env.example`), **or**
   - If your Pterodactyl egg provides an "Environment Variables" slot on the Startup tab, fill in the same variables there (variable names must match exactly: `PAIRING_NUMBER`, `OWNER_NUMBER`, `GEMINI_KEY_1`, etc.).
4. **Startup command** — set it to:
   ```
   npm install && npm start
   ```
   or if the egg already runs `npm install` automatically, just:
   ```
   node index.js
   ```
5. **Bot web dashboard** — if you want to access it from outside, match `DASHBOARD_PORT` in `.env` to the port allocation Pterodactyl gave that server.
6. **Start the server** from the panel, open the Console tab to see the pairing code, then link it as usual from WhatsApp.

> Note: Pterodactyl usually restarts the process automatically if it crashes — so there's no need for extra `pm2`/`screen` inside the container.

---

## If `isOwner` Fails to Detect

Sometimes automatic owner detection fails (a WhatsApp LID edge case). If this happens:
1. Set `DEBUG=true` in `.env`, restart the bot.
2. Send any message to the bot from the owner's number.
3. Open `logs/bot.log`, look for the `[owner-check]` line.
4. Copy the digits from `lid=XXXXXXXXXX@lid` (digits only, without `@lid`).
5. Set it as `OWNER_LID` in `.env`, restart the bot.

## Adding a New Plugin/Command

Every plugin uses the `onepunya.interface()` registry format — not a plain `export function run()`. Minimal example:

```js
export const meta = {
    interface: {
        cmd:  ['commandname', 'alias1'],   // main command + aliases, all lowercase
        tag:  'category',                  // used for grouping in the menu
        aliasOnly: true,                   // true = can only be invoked with a prefix
        desc: 'Short description for the menu',
        ai: {
            trigger: 'When the AI should trigger this command (in natural language)',
            examples: ['example sentence 1', 'example sentence 2'],
            args: { url: 'Explanation of the argument, if any' }, // optional
        },
        async run(sock, { raw, from, body, args, command, isOwner, pushname }) {
            // command logic goes here
            await sock.sendMessage(from, { text: 'Hello!' }, { quoted: raw });
        },
    },
};
```

Put new files in the `plugins/<category>/` folder. Plugins are automatically scanned and registered by `src/core/loader.js` based on `meta.interface.cmd` — **no need to register them manually anywhere else**. The `ai` block is optional but recommended, so the command can also be triggered via natural chat, not just via prefix.

The owner can reload all plugins without restarting the process using the `.reload` command.

> If porting a plugin from a reference bot (CommonJS / `module.exports` format), it must be adapted to the `onepunya.interface()` format above, not copy-pasted directly.

## Troubleshooting

| Issue | Solution |
|---|---|
| Bot exits immediately on start | Check that `PAIRING_NUMBER` is filled in `.env` |
| AI chat / intent engine feature doesn't work | Check that at least one `GEMINI_KEY_*` or `NAGA_API_KEY` is filled in |
| AI doesn't respond in a group | Mention the bot's name / the word `lev`, mention the bot, or reply to a bot message — in groups the AI doesn't auto-respond to every chat |
| Audio/effect feature errors | Make sure `ffmpeg` is installed on the system, check with `ffmpeg -version` |
| Session keeps logging out | Delete the `session/` folder, restart the bot, pair again |
| `isOwner` always false | Follow the steps above to manually set `OWNER_LID` |
| Bot dies when SSH closes (VPS) | Use `pm2` or `screen`, see the "Running on a Regular VPS" section |
| New plugin doesn't show up | Make sure the `meta.interface.cmd` & `meta.interface.run` format is correct, then run `.reload` or restart the bot |
