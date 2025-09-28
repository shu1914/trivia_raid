Trivia Raid - Minimal React + Node App (Generated)
-------------------------------------------------

What this provides:
- A simple Node/Express + socket.io server (server/index.js) that holds basic game state.
- A Vite + React client (client/) with two routes:
  - /visual  -> player-facing animated display
  - /control -> host control dashboard to drive the game

Quick start (after installing Node.js & npm):
1. Open a terminal at the project root: /mnt/data/trivia_raid_project
2. Install dependencies:
   npm run install-all
3. Start both server and client:
   npm run dev
4. Open the Visual display: http://localhost:3000/visual
   Open the Control panel: http://localhost:3000/control

Notes:
- This is a minimal scaffold implementing the core rules we discussed:
  * 30 HP players, boss HP configurable, no healing.
  * Correct = full damage to boss or rival. Wrong = half self-damage.
  * PvP resolved via separate action (flat 5 dmg).
  * Boss AoE at end of round (default 2 dmg).
- The server stores state in-memory (no DB). For production use, add persistence and authentication.
- Animations are lightweight and use framer-motion.

Files included:
- server/index.js
- client/src/...
- root package.json to orchestrate tasks

If you want, I can:
- Expand UI polish (better animations, icons, sound).
- Add a question editor and pools.
- Add ability cards & limited-use mechanics.
- Add authentication / lobby support so players can join from phones.

Enjoy playtesting!
