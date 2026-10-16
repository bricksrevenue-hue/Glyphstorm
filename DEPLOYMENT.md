# Publishing Glyphstorm

Status: source prepared; no public service created.

## Render setup

1. Put the contents of the glyphstorm directory in a Git repository you control, preserving package-lock.json.
2. Connect the publisher's Render account to that repository. Use a **Web Service**, not a Static Site.
3. Select the Node runtime.
4. Build command: npm ci --omit=dev.
5. Start command: npm start.
6. Set NODE_ENV=production and use Node 22 or newer.
7. Set the health check path to /health. The server reads Render's PORT variable.
8. Choose the hosting plan deliberately. The included Blueprint uses Free for staging. Free services can sleep after 15 minutes without incoming traffic and take approximately a minute to restart; use an approved always-on plan for the competition's instant-access experience.
9. Deploy one instance. Both HTTP and Socket.io use the same public origin and port.
10. Open the assigned HTTPS URL in a signed-out browser, create a room, and join from a different device. Complete the release checklist in VERIFICATION.md.

Render requires a source repository or deployment image and a hosting account. Connecting its ChatGPT integration can enable deployment assistance, but a connection was not available when this package was built.

No custom domain is required. No API keys are needed for word validation or gameplay.

## Operational notes

Do not deploy updates during an organized match: rooms are in memory and are lost on process restart. The server emits a shutdown notice on a graceful stop. Short client reconnection is supported while the server continues running.

Do not enable multiple instances without redesigning room ownership and adding shared state. The existing process is the authority for all rooms it serves.

Keep the production URL available during judging. A successful deploy must be followed by actual multi-device play, not just a successful /health response.

## Hosting documentation

- https://render.com/docs/web-services
- https://render.com/docs/websocket
- https://render.com/docs/free

The official public competition documents reviewed do not name a mandatory hosting provider. Additional signed-in mission requirements, if any, should be checked before entry.
