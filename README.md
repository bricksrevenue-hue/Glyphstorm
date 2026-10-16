# Glyphstorm

A real-time, visibly nonviolent word arena for 2–8 friends. Open crystals with light pulses, collect their letters, and spell words to score before the clock runs out.

## Run locally

Requires Node.js 22 or newer.

~~~sh
npm ci
npm start
~~~

Open http://localhost:3000. Open a second browser tab to join the same room with another name. The private session token is stored per tab, so separate tabs can represent separate players. For a phone on your local network, use the computer's LAN address and port 3000, subject to your firewall. The production deployment uses HTTPS.

Development with automatic server restarts: npm run dev. Restarts end in-memory rooms.

## Verify

~~~sh
npm run check
npm test
~~~

The tests cover gameplay invariants and real Socket.io connections from eight independent clients. They do not substitute for phone, laptop, visual, or usability testing. Read docs/VERIFICATION.md for completed checks and the remaining release checklist.

## Rules

- 2–8 active players; free-for-all or two equal teams.
- Host-selectable 3/5/7-minute rounds, with 5 minutes the default.
- Ten-letter inventory, with only used tiles consumed by a valid word.
- English words of 3–10 letters. A word scores once per player per round.
- Score = the tiles' values plus 2 × (length − 3)².
- Crystal letters have 2 seconds of pickup priority for their opener and teammates.
- Build mode stops the ship and gives up to 8 seconds of protection. Submitting, canceling, or reaching the time limit ends the shield and starts a 15-second cooldown.
- Optional opponent disruption; no friendly fire. Three unprotected pulse contacts cause a 3-second reset and up to 3 dropped letters. Earned points remain.
- Late arrivals spectate. Players return to the same lobby between rounds.
- Shared wins for tied final scores.

Desktop: WASD/arrows to move, mouse to aim, hold left mouse button to pulse, Space to build, Enter to submit, Escape to close word building. On touchscreens: left stick moves, right stick aims and pulses; use the Build a word button and tap tray letters.

## Deployment

The application serves its frontend and Socket.io backend from one Express HTTP server. It listens on 0.0.0.0 and the host-provided PORT (default 3000). /health returns service status.

Render is a proposed host, not an already-created deployment. A publisher account and source repository or Docker image are needed. Players need no hosting account. See docs/DEPLOYMENT.md.

The render.yaml configuration uses the Free instance type for development/staging. Render's Free services sleep after inactivity; choose and approve an always-on service before relying on an instant-open competition link. No paid service is provisioned by this source package.

The Dockerfile is included as another deployment option; it has not been built in this workspace.

## Architecture

- server/game.mjs: authoritative room state and gameplay simulation.
- server/index.mjs: Express, Socket.io, sessions, limits, snapshots, and lifecycle.
- server/dictionary.mjs: locally loaded dictionary and name filtering.
- public/app.js: lobby, HUD, word builder, controls, reconnect, and results.
- public/arena.js: Canvas drawing, camera, interpolation/prediction, effects, minimap.
- public/rules.js: shared public constants and score values.
- test/: rules and eight-client network tests.

The server validates actions and resolves pickups, word consumption, scores, and round deadlines. Clients send intentions, not trusted positions or points. Critical actions carry unique IDs for safe retries; movement uses volatile input packets. Rooms are separate.

## Current limits

- One Node.js instance with in-memory rooms. Do not scale to multiple instances without adding shared state and coordinating room ownership.
- Active matches do not survive a server restart or redeployment.
- A temporary client disconnect reserves the player's seat for 30 seconds; the world continues, and disconnection grants no immunity.
- A departed player's earned points remain in the current round's final standings.
- The initial room cap is 60 as a safety bound, not a demonstrated capacity claim. Each room allows 8 active players and 8 spectators.
- The dictionary has 192,308 filtered 3–10-letter entries in this pinned version. It includes uncommon words. Filtering is imperfect.
- The game is implemented and automated tests pass, but it is not yet publicly deployed or verified on real phones and laptops.

## Competition

The contest's official cutoff is October 30, 2026, at 11:59 p.m. Pacific (October 31, 2:59 a.m. in New York). Prepare the final URL, title, cover image, and description and submit personally through the designated Handshake mission. A source ZIP alone is not a completed public-game submission.

The nonviolent visual direction follows the user's decision. Neither source creation nor automated testing constitutes organizer approval or an eligibility guarantee.

See THIRD_PARTY_NOTICES.txt for dependency and dictionary licenses.
