import path from "path";
import http from "http";
import express from "express";
import { Server } from "socket.io";
import words from "./words.js";
import {
    ROLES,
    PHASES,
    clampImpostorCount,
    generateRoomCode,
    pickImpostors,
    pickWord,
    tallyVotes,
    checkWin,
    isValidNickname,
    isValidRoomCode,
    publicRoomState,
    listJoinableRooms
} from "./game-logic.js";
import { createRateLimiter, DEFAULT_RATE_LIMITS } from "./rate-limit.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;

function pad2(n) {
    return String(n).padStart(2, "0");
}

function timestamp() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function log(...args) {
    console.log(`[${timestamp()}]`, ...args);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 3600000,
    pingInterval: 25000,
    transports: ["websocket"]
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

const limiters = {};
function getLimiter(event) {
    if (!limiters[event]) {
        const cfg = DEFAULT_RATE_LIMITS[event];
        limiters[event] = createRateLimiter({ windowMs: cfg.windowMs, max: cfg.max });
    }
    return limiters[event];
}

function checkRate(socket, event) {
    if (!getLimiter(event)(socket.id)) {
        sendError(socket, "Demasiadas solicitudes. Espera un momento.");
        return false;
    }
    return true;
}

function getRoom(code) {
    return rooms[code] || null;
}

function isHost(room, socketId) {
    return Boolean(room) && room.host === socketId;
}

function sendError(socket, message) {
    socket.emit("errorMessage", { message });
}

function broadcastRoom(room) {
    io.to(room.code).emit("roomUpdate", publicRoomState(room));
}

function broadcastRoomList() {
    io.emit("roomList", listJoinableRooms(rooms));
}

function migrateHost(room) {
    const remaining = Object.keys(room.players);
    if (remaining.length === 0) return;
    room.host = remaining[0];
}

function resetRoomForNewRound(room) {
    room.phase = PHASES.LOBBY;
    room.votes = {};
    room.impostorIds = [];
    room.category = null;
    room.word = null;
    for (const id of Object.keys(room.players)) {
        delete room.players[id].role;
        delete room.players[id].expelled;
    }
}

function dealCards(room) {
    const activeIds = Object.keys(room.players).filter((id) => !room.players[id].expelled);
    const impostorIds = pickImpostors(activeIds, room.impostorCount);
    const { category, word } = pickWord(words);

    room.impostorIds = impostorIds;
    room.category = category;
    room.word = word;

    for (const id of activeIds) {
        const isImpostor = impostorIds.includes(id);
        const player = room.players[id];
        player.role = isImpostor ? ROLES.IMPOSTOR : ROLES.CREWMATE;
        const payload = {
            role: player.role,
            category
        };
        if (!isImpostor) {
            payload.word = word;
        }
        io.to(id).emit("card", payload);
    }
}

function removePlayerFromRoom(socket, code) {
    const room = getRoom(code);
    if (!room) return;
    if (!room.players[socket.id]) return;

    const wasHost = room.host === socket.id;
    const nickname = room.players[socket.id].nickname;
    delete room.players[socket.id];
    delete room.votes[socket.id];
    socket.leave(code);

    if (Object.keys(room.players).length === 0) {
        delete rooms[code];
        broadcastRoomList();
        log(`Room ${code} deleted (empty).`);
        return;
    }

    if (wasHost) {
        migrateHost(room);
    }
    broadcastRoom(room);
    broadcastRoomList();
    log(`Player ${nickname} left room ${code}.`);
}

function finishVoting(code) {
    const room = getRoom(code);
    if (!room) return;

    const { expelledId, tie, counts } = tallyVotes(room.votes);

    if (tie) {
        room.votes = {};
        io.to(code).emit("votingResult", { tie: true, counts });
        return;
    }

    const expelledPlayer = room.players[expelledId];
    const expelledNickname = expelledPlayer ? expelledPlayer.nickname : "Jugador";
    const wasImpostor = expelledPlayer ? expelledPlayer.role === ROLES.IMPOSTOR : false;

    if (expelledPlayer) {
        expelledPlayer.expelled = true;
    }
    delete room.votes[expelledId];

    io.to(code).emit("votingResult", {
        tie: false,
        expelled: expelledNickname,
        wasImpostor
    });

    const expelledSocket = io.sockets.sockets.get(expelledId);
    if (expelledSocket) {
        expelledSocket.emit("youWereExpelled", { wasImpostor });
    }

    room.votes = {};
    const win = checkWin(room.players);
    if (win) {
        io.to(code).emit("gameEnded", win);
    }
    resetRoomForNewRound(room);
    broadcastRoom(room);
    broadcastRoomList();
}

io.on("connection", (socket) => {
    log("Player connected:", socket.id);
    socket.emit("roomList", listJoinableRooms(rooms));

    socket.on("createRoom", ({ nickname } = {}) => {
        if (!checkRate(socket, "createRoom")) return;
        if (!isValidNickname(nickname)) {
            return sendError(socket, "Ingresa un nickname válido (1–20 caracteres).");
        }
        const code = generateRoomCode();
        rooms[code] = {
            code,
            host: socket.id,
            players: {
                [socket.id]: { nickname: nickname.trim() }
            },
            phase: PHASES.LOBBY,
            votes: {},
            impostorCount: 1,
            currentRound: 0,
            impostorIds: [],
            category: null,
            word: null
        };
        socket.join(code);
        socket.emit("roomCreated", { code });
        broadcastRoom(rooms[code]);
        broadcastRoomList();
        log(`Room ${code} created by ${nickname}.`);
    });

    socket.on("joinRoom", ({ nickname, code } = {}) => {
        if (!checkRate(socket, "joinRoom")) return;
        if (!isValidNickname(nickname)) {
            return sendError(socket, "Ingresa un nickname válido (1–20 caracteres).");
        }
        if (!isValidRoomCode(code)) {
            return sendError(socket, "El código de sala debe tener 4 caracteres.");
        }
        const room = getRoom(code);
        if (!room) {
            return sendError(socket, "La sala no existe.");
        }
        if (room.phase !== PHASES.LOBBY) {
            return sendError(socket, "La partida ya comenzó. Espera a que termine la ronda.");
        }
        room.players[socket.id] = { nickname: nickname.trim() };
        socket.join(code);
        socket.emit("roomCreated", { code });
        broadcastRoom(room);
        broadcastRoomList();
        log(`${nickname} joined room ${code}.`);
    });

    socket.on("setImpostorCount", ({ code, count } = {}) => {
        if (!checkRate(socket, "setImpostorCount")) return;
        const room = getRoom(code);
        if (!room) return sendError(socket, "La sala no existe.");
        if (!isHost(room, socket.id)) {
            return sendError(socket, "Solo el anfitrión puede cambiar la cantidad de impostores.");
        }
        if (room.phase !== PHASES.LOBBY) {
            return sendError(socket, "Solo puedes cambiar la cantidad de impostores en la sala de espera.");
        }
        const playerCount = Object.keys(room.players).length;
        room.impostorCount = clampImpostorCount(count, playerCount);
        broadcastRoom(room);
    });

    socket.on("startGame", ({ code } = {}) => {
        if (!checkRate(socket, "startGame")) return;
        const room = getRoom(code);
        if (!room) return sendError(socket, "La sala no existe.");
        if (!isHost(room, socket.id)) {
            return sendError(socket, "Solo el anfitrión puede iniciar la partida.");
        }
        if (room.phase !== PHASES.LOBBY) {
            return sendError(socket, "La partida ya está en curso.");
        }
        const activeCount = Object.values(room.players).filter((p) => !p.expelled).length;
        if (activeCount < 2) {
            return sendError(socket, "Se necesitan al menos 2 jugadores activos para iniciar.");
        }

        room.currentRound += 1;
        room.phase = PHASES.GAME;
        dealCards(room);
        broadcastRoom(room);
        broadcastRoomList();
        log(`Room ${code} round ${room.currentRound} started.`);
    });

    socket.on("vote", ({ code, targetId } = {}) => {
        if (!checkRate(socket, "vote")) return;
        const room = getRoom(code);
        if (!room || room.phase !== PHASES.GAME) return;
        if (!room.players[targetId] || room.players[targetId].expelled) return;
        if (targetId === socket.id) return;
        if (room.players[socket.id] && room.players[socket.id].expelled) return;

        room.votes[socket.id] = targetId;
        broadcastRoom(room);

        const activeCount = Object.values(room.players).filter((p) => !p.expelled).length;
        if (Object.keys(room.votes).length === activeCount) {
            finishVoting(code);
        }
    });

    socket.on("leaveRoom", ({ code } = {}) => {
        if (!checkRate(socket, "leaveRoom")) return;
        removePlayerFromRoom(socket, code);
    });

    socket.on("disconnect", () => {
        log("Player disconnected:", socket.id);
        for (const code of Object.keys(rooms)) {
            removePlayerFromRoom(socket, code);
        }
    });
});

server.listen(PORT, () => {
    log(`Impostor server running on http://localhost:${PORT}`);
});
