# Magpie

Magpie will give a RuneScape: Dragonwilds dedicated server its own website: who is online, what happened in the world and how it is progressing, live and with history. A collector runs beside the server and reports to the site. Players install nothing.

It is in research. The site and the collector are not built yet; the work is tracked in [issues](https://github.com/oddessentials/magpie/issues). `tools/rig` holds the scripts that run a dedicated server for a bounded time and record what it writes, read the game's containers, and decode its world saves. `tools/gamefacts` reads the dedicated server's cooked data into `web/src/lib/world`: skills and the XP curve, quests, journal entries, items, recipes and the progression tables, with their English text, stamped with the Steam build they came from (`npm run facts:extract`).

`savereader` is a Go tool that reads a world save (`Saved/SaveGames/<world>.sav` on the dedicated server) and prints the world header, weather, world events and cached characters as JSON: `magpie-savereader read <path>`. It only reads, it never prints the session password, and it reports a save that is still being written instead of decoding part of it. `npm run savereader:build` builds it for Windows and Linux.

Magpie is an unofficial fan project, not affiliated with or endorsed by Jagex Ltd. RuneScape is a trademark of Jagex Ltd.
