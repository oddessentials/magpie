# Rules for this repository

1. No code comments in any language: no `//`, `/* */`, `#`, `--` or `<!-- -->` comments, no doc comments, no commented-out code, no TODO or FIXME markers. `npm run comments:check` enforces this.
2. The only documents are `README.md`, `LICENSE` and, once they exist, the landing page in `site/`. Do not add others. Open work lives in GitHub issues, not in notes; code and fixtures are the source of truth.
3. `web/openapi.yaml`, once it exists, is the contract for the site API, the live stream, the collector ingest and the actions the site hands the collector. `npm run api:types` regenerates the types; the collector's contract test validates its events against the same file.
4. Facts about RuneScape: Dragonwilds come from the game's own code and files, read from the dedicated server build (Steam app 4019830) and the client (Steam app 1374490), never from memory. Record the game version and Steam build each fact was read from; `tools/rig/build.json` holds the builds the facts come from, and `tools/rig` holds the scripts that run a server, read the containers and decode the saves.
5. One version number: the root `package.json` `version`. Every build reads it.
6. Work on a branch and merge through a pull request once CI is green. CI runs `npm run verify`; push branches to `origin` (`git@github.com-odd:oddessentials/magpie.git`).
7. Public responses and pages never contain IP addresses, platform user ids, passwords or join codes.
8. No Jagex artwork, logos or extracted game textures in the repository. Derived facts only, and Magpie's own art.
