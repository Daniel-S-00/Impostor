# Impostor Online

A browser-based multiplayer party game built with **Node.js**, **Express**, and **Socket.IO**.

One player is secretly the **Impostor** — they don't know the secret word. The rest
("Tripulantes") all share the same word and category. Players take turns giving clues,
then vote to expel someone. The crew wins if the Impostor is expelled; the Impostor
wins if they outnumber the crew.

## How it works

- A player creates a room and gets a 4-character room code.
- Other players join using the code and a nickname.
- The host picks how many impostors will be in the round (1, 2, or 3) and starts
  the game. The server:
  - Picks N random players as the **Impostor(s)**.
  - Picks a random category and a random word from `server/words.js`.
  - Sends each player a private "card" (Impostor sees only the category;
    Tripulantes see the category and the word).
- Players discuss out-of-band (in person, voice chat, etc.) and the host starts a
  vote.
- Everyone votes for someone to expel. The server tallies votes:
  - **Tie** → no one is expelled, the host can re-trigger voting.
  - **Majority** → the player with the most votes is expelled. The room is told
    whether they were an Impostor.
- After each expulsion the win conditions are checked:
  - No Impostors left → **Tripulantes** win.
  - Impostors ≥ remaining crew → **Impostores** win.
- After a round (tie or otherwise) the room resets to the lobby and the host can
  start the next round.

## Project structure

```
Impostor-online/
├── AGENTS.md                  # project conventions for AI agents
├── README.md                  # this file
├── LICENSE                    # ISC license
└── server/
    ├── package.json
    ├── index.js               # Express + Socket.IO server, socket handlers
    ├── game-logic.js          # pure game logic (importable, testable)
    ├── game-logic.test.js     # vitest tests for game-logic
    ├── words.js               # Spanish word lists by category
    └── public/
        └── index.html         # single-page client (vanilla JS)
```

The client is intentionally minimal: one HTML file with inline CSS and JS that
talks to the server over Socket.IO. No build step.

## Requirements

- **Node.js** 18+ (the server uses Express 5 and Socket.IO 4).
- A modern browser (Chrome, Edge, Firefox, Safari).

## Getting started

```powershell
cd server
npm install
npm start
```

Then open <http://localhost:3000> in your browser.

To play with friends on the same network, share your machine's LAN IP on port
`3000` (e.g. `http://192.168.1.20:3000`). Everyone opens the same URL, one person
creates a room, and the others join with the 4-character code.

Environment variables:

- `PORT` — server port (default `3000`).

## Running the tests

```powershell
cd server
npm test
```

Tests cover the pure game logic in `server/game-logic.js` (vote tallying, win
conditions, role picking, input validation). They do not exercise the socket
layer.

## Socket events (reference)

Client → server:

| Event              | Payload                  | Description                                  |
|--------------------|--------------------------|----------------------------------------------|
| `createRoom`       | `{ nickname }`           | Create a new room, become host.              |
| `joinRoom`         | `{ nickname, code }`     | Join an existing room (lobby phase only).    |
| `setImpostorCount` | `{ code, count }`        | Host picks how many impostors (1–3).         |
| `startGame`        | `{ code }`               | Host starts a new round (≥ 2 players).       |
| `startVoting`      | `{ code }`               | Host opens the voting phase (≥ 3 players).   |
| `vote`             | `{ code, targetId }`     | Cast a vote (cannot vote for yourself).      |

Server → client:

| Event            | Payload                                  | Description                                |
|------------------|------------------------------------------|--------------------------------------------|
| `roomCreated`    | `{ code }`                               | Sent to the creator with the code.         |
| `roomUpdate`     | `publicRoomState`                        | Lobby / in-game state (no roles, no word). |
| `card`           | `{ role, category, word? }`              | Private role card.                         |
| `votingStarted`  | `publicRoomState`                        | Voting phase opened.                       |
| `votingResult`   | `{ tie, counts, expelled?, wasImpostor? }` | Round result.                            |
| `gameEnded`      | `{ winner, reason }`                     | `"crew"` or `"impostors"`.                 |
| `youWereExpelled`| `{ wasImpostor }`                        | Sent only to the expelled player.          |
| `errorMessage`   | `{ message }`                            | Human-readable error in Spanish.           |

`publicRoomState` deliberately omits roles, the secret word, and the impostor
ids so the server is the single source of truth for private information.

## Notes

- Room state is kept **in memory** in the `rooms` object — restarting the server
  wipes all rooms. There is no database.
- Rooms are deleted automatically when the last player disconnects.
- If the host disconnects, the next player in the room is promoted to host.
- Word categories and lists live in `server/words.js`; edit that file to add or
  change words. The category names are the keys in the `words` object.

## License

ISC (see `LICENSE`).
