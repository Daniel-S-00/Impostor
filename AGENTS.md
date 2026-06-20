# AGENTS.md — Impostor Online

This document guides AI agents building and maintaining **Impostor Online**, a
browser-based multiplayer "Impostor" party game (Spanish UI, English code).
Follow these conventions unless the user explicitly says otherwise.

---

## What this is

A real-time party game in the browser. Players join a room, get a private role
card, and one of them is the **Impostor** who does not know the secret word.
After discussing out-of-band, players vote to expel someone. The crew wins if
the Impostor is expelled; the Impostor wins if they outnumber the crew.

## Tech stack

- **Runtime:** Node.js 18+
- **Server:** Express 5, Socket.IO 4
- **Client:** vanilla HTML + CSS + JS (no framework, no build step)
- **Tests:** Vitest 4
- **Package manager:** npm (a `package-lock.json` is committed)
- **Persistence:** in-memory only (no database)

## File layout

```
Impostor-online/
├── AGENTS.md                  # this file
├── README.md                  # user-facing docs
├── DEPLOY.md                  # Render + Cloudflare Tunnel deployment guide
├── render.yaml                # Render Blueprint (infra-as-code)
├── .gitignore
└── server/
    ├── package.json
    ├── index.js               # server bootstrap + socket handlers
    ├── game-logic.js          # pure game logic (importable, testable)
    ├── game-logic.test.js     # vitest tests for game-logic
    ├── rate-limit.js          # per-socket rate limiter
    ├── rate-limit.test.js     # vitest tests for rate limiter
    ├── words.js               # Spanish word lists by category
    ├── LICENSE                # ISC license
    └── public/
        └── index.html         # single-page client (vanilla JS)
```

Keep it this small. Do not introduce a build step, a framework, or a
database without an explicit user request.

---

## The one rule that matters most

> **All code, identifiers, variable names, function names, file names, comments,
> and commit messages must be in English.**
> **All strings visible to the user must be in Spanish.**

This applies to:

- Every `.js` file in `server/` and to the JS inside `index.html`.
- All HTML body text, button labels, alert messages, and Spanish role labels
  (`IMPOSTOR`, `TRIPULANTE`).
- The Spanish word list in `server/words.js` (categories and words are
  user-visible).
- Server-emitted error messages shown to the user (e.g. `"La sala no existe."`).

Internal wire codes may use **English tokens** even when the rendered label is
Spanish. For example, the server sends `role: "impostor"` over the wire; the
client renders it as `IMPOSTOR` in the UI.

---

## Naming conventions

- **Files:** `kebab-case.js` (e.g. `game-logic.js`).
- **Variables / functions:** `camelCase`.
- **Constants:** `UPPER_SNAKE_CASE`, exported as a frozen object (see `ROLES`,
  `PHASES`, `WINNERS` in `game-logic.js`).
- **Socket event names:** `camelCase`, present-tense verb for client → server
  (`createRoom`, `startGame`, `vote`), state-noun or past-tense for server →
  client (`roomCreated`, `roomUpdate`, `card`, `votingResult`).
- **Phases:** use the constants from `PHASES` — never inline the string
  `"lobby"`, `"game"`, `"voting"`.
- **Roles / winners:** use the constants from `ROLES` and `WINNERS`.

## Socket events

Client → server:

| Event              | Payload                       | Notes                                 |
|--------------------|-------------------------------|---------------------------------------|
| `createRoom`       | `{ nickname }`                | Becomes host.                         |
| `joinRoom`         | `{ nickname, code }`          | Rejected if the room is mid-round.    |
| `setImpostorCount` | `{ code, count }`             | Host only, lobby phase only.          |
| `startGame`        | `{ code }`                    | Host only, lobby phase, ≥ 2 players.  |
| `startVoting`      | `{ code }`                    | Host only, game phase, ≥ 3 players.   |
| `vote`             | `{ code, targetId }`          | Cannot vote for yourself.             |

Server → client:

| Event              | Payload                                                 | Notes                              |
|--------------------|---------------------------------------------------------|------------------------------------|
| `roomCreated`      | `{ code }`                                              | Sent only to the creator.          |
| `roomUpdate`       | `publicRoomState`                                       | Broadcast to the whole room.       |
| `card`             | `{ role, category, word? }`                             | **Private** — one socket only.     |
| `votingStarted`    | `publicRoomState`                                       | Phase becomes `voting`.            |
| `votingResult`     | `{ tie, counts, expelled?, wasImpostor? }`              | Broadcast.                         |
| `gameEnded`        | `{ winner, reason }`                                    | Broadcast.                         |
| `youWereExpelled`  | `{ wasImpostor }`                                       | **Private** — expelled socket only.|
| `errorMessage`     | `{ message }`                                           | Human-readable Spanish.            |

`publicRoomState` is the only shape sent in `roomUpdate` / `votingStarted`.
**Never** include `role`, `word`, or `impostorIds` in it — see the
`publicRoomState` test in `game-logic.test.js`.

## Room state machine

```
            startGame                 startVoting
   lobby ───────────▶ game ─────────────────▶ voting
     ▲                  │                        │
     │                  │                        │ tally
     │   resetRoomFor   │  tie                   ▼
     └──── NewRound ────┘◀──────────  finishVoting
                                              │ win
                                              ▼
                                          (gameEnded)
                                              │
                                              ▼
                                            lobby
```

- `lobby` → host can change impostor count and start the round.
- `game` → cards have been dealt, host can start voting.
- `voting` → players cast votes; server auto-finishes when everyone voted.
- Tie → votes cleared, room stays in `game` for the host to re-trigger voting.
- Non-tie, no win → room resets to `lobby` (next round).
- Non-tie, win → `gameEnded` emitted, then room resets to `lobby`.

## Server-side rules (do not skip)

- Validate every input from the client. Use `isValidNickname` and
  `isValidRoomCode` from `game-logic.js`.
- Authorize host-only actions by checking `room.host === socket.id` server-side.
  Never trust the client to enforce this.
- All error messages go through `socket.emit("errorMessage", { message })`.
  The payload is an object with a `message` string.
- Never store or echo the secret `word` back to the room. Only the private
  `card` event carries it (and only to crewmates, never to impostors).

## Client-side rules

- All view transitions go through `renderView()`. Do not toggle `.hidden`
  directly outside of `showView()`.
- Escape any user-controlled string before injecting it into the DOM
  (`escapeHtml` exists in `index.html`).
- Spanish strings live inline in the HTML / JS. If a string is shown to the
  user, it is in Spanish — period.

---

## How to run

```powershell
cd server
npm install
npm start
```

Open <http://localhost:3000>. To play across the LAN, share your machine's
LAN IP on port 3000.

Environment variables:

- `PORT` — server port (default `3000`).

## How to test

```powershell
cd server
npm test
```

Tests cover `game-logic.js` only (pure functions). They do not exercise the
socket layer. Add new tests next to the file under test
(`foo.js` → `foo.test.js`).

## How to commit

- Conventional Commits: `type(scope): subject` (≤ 50 chars on the subject).
- Valid types: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`.
- Stage only intended files. Never commit `node_modules/`, `package-lock.json`
  changes unless deps actually changed.
- Do **not** run `git push` unless the user asks.

---

## Do not

- Do not put Spanish strings in `.js` server code **other than** the
  user-visible payload inside `errorMessage` / `votingResult` /
  `youWereExpelled`. Spanish lives in `index.html` and in the `words.js` list.
- Do not inline the strings `"lobby"`, `"game"`, `"voting"`, `"impostor"`,
  `"crewmate"`, `"crew"`, `"impostors"` — use the exported constants.
- Do not perform authorization on the client. The server is the only source of
  truth.
- Do not hardcode the port. Use `process.env.PORT` (with a default).
- Do not introduce a database, a build step, or a frontend framework without
  an explicit request.
- Do not commit `node_modules/` or `.env` files.
- Do not hand-edit generated files (none right now, but the rule still applies
  if you add any).
- Do not run `git push`.
