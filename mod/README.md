# Magpie Events

An optional [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) Lua mod for RuneScape: Dragonwilds dedicated servers on Windows. It notices what the server's log and world save never report and writes each one as a JSON line for the [Magpie](../README.md) collector. It also gives the server a stop that saves: when the file named by `MAGPIE_STOP_FILE` appears, the mod calls the game's own world save and then quits the engine, which nothing else on Windows does without losing everything since the last autosave.

Every line has `v` (1), `type`, `ts` (UTC), `hook` (the game function that fired) and `self` (the object it fired on). Where a player is involved it adds `player_name`, `session_id`, `owner` and `platform`; the rest of the line is the function's parameters, decoded by name. The collector keeps `player_name` and the platform family and drops every id before anything leaves the machine.

| `type`                                                                                    | When                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `chat`, `player_event`                                                                    | A player sends a chat line, or the chat backend reports a player event such as joining      |
| `connected`, `disconnect`, `leaving`, `character_registered`, `character_info`, `kicked`  | Presence: the connection completes, a disconnect with its reason, a menu leave, a character |
| `death`, `respawn`, `revive`                                                              | A player dies, respawns or is revived                                                       |
| `skill_level`, `xp`, `xp_changed`                                                         | A skill levels up or gains XP                                                               |
| `quest`, `quest_complete`, `journal`, `journal_read`                                      | Quest progress, a completed quest, a journal unlock or a journal entry marked read           |
| `craft`, `craft_result`, `build`, `build_complete`, `teleport`                            | Crafting, building and lodestone travel                                                     |
| `base_raid`, `dragon_event`, `hunted`, `boss_summon`, `boss_spawn`                        | The world's events                                                                          |
| `landmark`, `first_pickup`, `first_interaction`, `agility_time`, `agility_validated`      | Discoveries and agility course times                                                        |
| `farm_harvest`, `farm_plant`, `map_pin`, `waypoint`, `conversation`, `sign`, `named_object` | Farming, map marks, talking to a character, signs and custom names                          |
| `notice`, `notice_text`, `notice_fixed`, `resting`                                        | The game's own notices to a player                                                          |
| `admin_action`, `admin_info`, `ownership`, `privileges_granted`, `privileges_revoked`, `world_edited` | Administration                                                                    |
| `mod_loaded`, `stop_requested`, `save_requested`, `save_done`, `save_failed`, `quit`, `quit_failed` | The mod itself and the stop                                                         |

Nothing changes for players, who need no mods. The file stays on the server and the collector sends the events to your site only.

## Install

The mod needs UE4SS on the Windows dedicated server; it does not run on the Linux build. It is verified with the RE-UE4SS experimental build of 2026-09-28 on server build 25501739 (game version 1.0.0.6). The server executable does not load proxy libraries, so UE4SS has to be injected when the server starts: create the process suspended, queue `LoadLibraryW` of `UE4SS.dll` on its main thread and resume it. The rig runner in `tools/rig` does exactly that for a test server.

Copy the `MagpieEvents` folder into the UE4SS `Mods` folder and restart the server. The folder carries `enabled.txt`, which switches it on. Set these in the server process's environment:

| Variable             | Meaning                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `MAGPIE_EVENTS_FILE` | Where the JSON lines go. Without it the file is `magpie-events.jsonl` in the server's working directory |
| `MAGPIE_STOP_FILE`   | The file whose appearance saves the world and stops the server. Without it the stop is off    |

## How it works

The hooks are the game's own remote procedure calls, the functions named `Server_`, `Client_` and `NetMulticast_` in the server's reflection data, because those are the ones that run through the engine's event path where a hook can see them. Each hook decodes what the game passes it by reflection: structs by their fields, GUIDs as hex, gameplay tags as names, three levels deep.

Automated checks execute every production Lua callback against build-stamped engine schemas and compare representative output with transient engine userdata captured by the isolated rig. Enums retain their numeric values, inherited vectors retain their coordinates, and invalid numbers cannot corrupt JSON. The collector uses the updated quest state, the current XP total and victim coordinates; crafting requests and failures do not become completed crafts, and building requests wait for the completion hook. Synthetic fixtures continue through signed ingest and projection rebuilding in CI. They are labeled as synthetic, with unknown parameter shapes retained as fallback events.

The stop calls `PersistenceSubsystem:SaveGame`, the same function the five-minute autosave and a menu leave use, waits for the game to report the save, and then runs `quit`, which is the engine's orderly shutdown.

The mod never changes gameplay, never writes a save and never touches a game file. The game's session attribute `ModDetection` stays 0 with it loaded, so the server does not advertise itself as modded; tell your players.

Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.
