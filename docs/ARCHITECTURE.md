# Architecture

One rule keeps the code tidy: **every folder answers one question**, and files only import "downwards".

## Layers

```
plugins/            what the bot can do (one command = one file)
   │
src/runtime/        keeps the bot alive (connect, reconnect, listeners, background jobs)
src/core/           decides what a message means (handler → pipeline → plugin)
   │
src/groups/  src/ai/  src/menu/     features that need many parts of the bot
   │
src/wa/  src/api/  src/storage/  src/limits/  src/media/  src/dashboard/
   │
src/util/           generic helpers, no bot knowledge
src/config.js       the only file that reads environment variables
```

Rule of thumb: a folder imports from the ones below it, not above. Low-level folders (`util`, `media`, `wa`, `storage`) never import `core`, `ai` or `plugins`. One known exception: `core` and `ai` call each other (the handler hands messages to the AI, the AI reads the plugin registry).

## Where do I put it?

| I want to add...                          | Put it in                               |
|-------------------------------------------|-----------------------------------------|
| A new command                             | `plugins/<category>/<name>.js`          |
| A call to an external website/API         | `src/api/`                              |
| Something WhatsApp-specific (message type, cache) | `src/wa/`                       |
| Something saved to the database           | `src/storage/`                          |
| A new limit / quota                       | `src/limits/limit.js`                   |
| Media size checks / audio processing      | `src/media/`                            |
| A group rule (anti-link, welcome, captcha)| `src/groups/`                           |
| A tiny generic helper                     | `src/util/`                             |
| A new `.env` variable                     | `src/config.js` + `.env.example`        |

## Importing

Folders with several related files have an `index.js` barrel, so plugins import from the folder:

```js
import { logger, sleep } from '../../src/util/index.js';
import { extractBody, sendThumbFromUrl } from '../../src/wa/index.js';
import { ytDownload } from '../../src/api/index.js';
```

Folders with a single main file (`limits`, `storage`, `menu`, `media`) are imported by file name, e.g. `src/limits/limit.js`, `src/storage/db.js`, `src/core/plugin.js`.

## Startup flow

`index.js` → `initGlobals()` → `guardProcess()` → `start()` (`runtime/connection.js`) → `bindSocketEvents()` (`runtime/listeners.js`) → each message goes to `core/handler.js` → `core/pipeline.js` → the plugin's `run`.

## Checking your work

```bash
npm run check            # plugins: code errors, empty env keys, API host health
npm run check -- --no-probe
npm run check:imports    # every import points to a real file and a real export
```
