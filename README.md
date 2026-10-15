# Gully Wars — Trivia Demolition

A four-player browser demolition derby with two simultaneous semi-finals and a final.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

Open http://localhost:3000 in four independent browser sessions. Create a room in one, join with its code in the other three, mark all ready, and start. Share the URL for remote players only after deployment.

## Deploy with Render

1. Upload the project folder to a GitHub repository.
2. In Render, create a Web Service from that repository (or use the included `render.yaml` blueprint).
3. Build command: `npm install`; start command: `npm start`.
4. Open the resulting HTTPS URL. Invite players with the six-character code.

This server uses in-memory rooms, so deploy one instance only. Restarting the server resets tournaments. Free hosting may sleep when idle. Production scaling would require shared state and reconnection improvements.

## Controls

WASD / arrows to drive, Space to use nitro. On mobile, use touch buttons. Answer trivia questions to gain nitro and repair HP.

## MVP limitations

The graphics are canvas-drawn rather than production pixel-art assets. Obstacles lose HP and disappear rather than using full rigid-body destruction. The trivia bank contains 20 starter questions, not the proposed 100. Multiplayer and device testing still need to be performed on a running server. No public deployment has been performed.
