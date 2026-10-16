# Verification record

Build date: October 16, 2026.

## Completed in the development environment

- Node syntax checks for the server and client JavaScript.
- 18 automated tests passed, including real Socket.io connections from eight independent clients and two isolated rooms.
- Contested pickup uniqueness, 10-letter capacity, 2-second priority, and teammate collection.
- Wrapped-distance collection and pulse collisions across the arena seam.
- Valid, invalid, reused, fabricated, and repeated-letter word submissions; submission requires word-building mode.
- No duplicate scoring when a submission acknowledgement is retried.
- Shield timing, cooldown, movement/pulse/collection restrictions.
- Optional disruption, friendly-fire exclusion, protected ships, letter drops, and reset protection.
- Server deadline rejection and shared wins on tied scores.
- Late spectators, readiness, balanced-team enforcement, host migration, and retained departure scores.
- Reconnection with a private token, recovery after all clients briefly disconnect, spectator action rejection, and rematch clearing.
- HTTP responses for the landing page, health endpoint, dictionary metadata, and Socket.io client script.
- Static validation that all referenced fixed DOM element IDs exist and are unique.

These are test results for code and network behavior, not a claim that eight people have played the game on real devices.

## Not yet verified

- Browser visual rendering and interactions. No supported browser QA tool was available in the managed build environment.
- Real phone and laptop usability and simultaneous touch gestures.
- Mobile Safari and Chrome behavior, audio permissions, keyboard focus, reduced motion, and screen-reader usability.
- Frame rate, latency, and bandwidth on actual hosted hardware.
- Public HTTPS/WSS deployment and anonymous access.
- Docker image build.

## Release playtest

1. Open the public URL while signed out. Create and join a room without any player account.
2. Use separate devices and networks, including a phone and a laptop.
3. Test both modes, all match durations, and disruption on/off.
4. Verify letter readability, accurate aiming, wrapped edges, collection priority, full trays, discards, typed words, and tapped words.
5. Verify shield expiry, cooldown, invalid words, resets, and no friendly fire.
6. Compare every screen's score and final result.
7. Temporarily disconnect one device, reconnect within 30 seconds, then try after the reservation expires.
8. Leave as host and verify control transfer. Join mid-round and verify spectator-only access.
9. Play repeated rounds in the same room; verify previous scores and word histories are cleared.
10. Run a full 8-player round and record devices, browsers, network conditions, visible issues, and fixes.

Complete these checks before calling the game competition-ready.
