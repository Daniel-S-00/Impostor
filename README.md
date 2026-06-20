# Impostor Online

A browser-based multiplayer party game built with **Node.js**, **Express**, and **Socket.IO**.

One player is secretly the **Impostor** — they don't know the secret word. The rest
("Amigos") all share the same word and category. Players take turns giving clues, then
vote to expel someone. The crew wins if the Impostor is expelled; the Impostor wins if
they survive until the crew is outnumbered.

## How it works

- A player creates a room and gets a 4-character room code.
- Other players join using the code and a nickname.
- The host starts the game. The server:
  - Picks one random player as the **Impostor**.
  - Picks a random category and a random word from `server/categories.js`.
  - Sends each player a private "card" (Impostor sees only the category; Amigos see
    the category and the word).
- Players discuss out-of-band (in person, voice chat, etc.) and the host starts a
  vote.
- Everyone votes for someone to expel. The server tallies votes:
  - **Tie** → no one is expelled, the game continues.
  - **Majority** → the player with the most votes is expelled. The room is told
    whether they were the Impostor.
- After each expulsion the win conditions are checked:
  - No Impostors left → **Amigos** win.
  - Impostors ≥ remaining crew → **Impostores** win.

## Project structure

```
Impostor-online/
└── server/
    ├── index.js          # Express + Socket.IO server, game logic
    ├── categories.js     # Word lists grouped by category
    ├── package.json
    └── public/
        └── index.html    # Single-page client (vanilla JS)
```

The client is intentionally minimal: one HTML file with inline CSS and JS that
talks to the server over Socket.IO. No build step.

## Requirements

- **Node.js** 18+ (the server uses Express 5 and the built-in `ws` engine from
  Socket.IO 4).
- A modern browser (Chrome, Edge, Firefox, Safari).

## Getting started

```powershell
cd server
npm install
node index.js
```

Then open <http://localhost:3000> in your browser.

To play with friends on the same network, share your machine's LAN IP on port
`3000` (e.g. `http://192.168.1.20:3000`). Everyone opens the same URL, one person
creates a room, and the others join with the 4-character code.

## Socket events (reference)

Client → server:

| Event          | Payload                                | Description                       |
|----------------|----------------------------------------|-----------------------------------|
| `createRoom`   | `{ nickname }`                         | Create a new room, become host.   |
| `joinRoom`     | `{ nickname, code }`                   | Join an existing room.            |
| `startGame`    | `code`                                 | Host starts a new round.          |
| `startVoting`  | `code`                                 | Open the voting phase.            |
| `vote`         | `{ code, targetId }`                   | Cast a vote.                      |

Server → client:

| Event            | Payload                                        | Description                          |
|------------------|------------------------------------------------|--------------------------------------|
| `roomCreated`    | `{ code }`                                     | Sent to the creator with the code.   |
| `roomUpdate`     | `room`                                         | Current players + host.              |
| `card`           | `{ role, category, word? }`                    | Private role card for this player.   |
| `votingStarted`  | `{ players }`                                  | Voting phase opened.                 |
| `votingResult`   | `{ tie, expelled, wasImpostor }`               | Round result.                        |
| `gameEnded`      | `{ winner }`                                   | `"amigos"` or `"impostores"`.        |
| `errorMessage`   | `string`                                       | Human-readable error.                |

## Notes

- Room state is kept **in memory** in the `rooms` object — restarting the server
  wipes all rooms. There is no database.
- Rooms are deleted automatically when the last player disconnects.
- Word categories and lists live in `server/categories.js`; edit that file to add
  or change words.
- There are no automated tests yet (`npm test` is a placeholder).

## License

ISC (see `server/LICENSE`).
