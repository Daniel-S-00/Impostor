const categories = require("./categories");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {
    votes: {},
    phase: "lobby" // lobby | game | voting | ended
};

function generateCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
    console.log("Jugador conectado:", socket.id);

    socket.on("createRoom", ({ nickname }) => {
        const code = generateCode();

        rooms[code] = {
            host: socket.id,
            players: {
                [socket.id]: { nickname }
            }
        };

        socket.join(code);
        socket.emit("roomCreated", { code });
        io.to(code).emit("roomUpdate", rooms[code]);
    });

    socket.on("joinRoom", ({ nickname, code }) => {
        if (!rooms[code]) {
            socket.emit("errorMessage", "La sala no existe");
            return;
        }

        rooms[code].players[socket.id] = { nickname };
        socket.join(code);
        io.to(code).emit("roomUpdate", rooms[code]);
    });

    socket.on("startGame", (code) => {
        const room = rooms[code];
        if (!room) return;

        const playerIds = Object.keys(room.players);

        // elegir impostor
        const impostorId = playerIds[Math.floor(Math.random() * playerIds.length)];

        // elegir categoría
        const categoryNames = Object.keys(categories);
        const selectedCategory =
            categoryNames[Math.floor(Math.random() * categoryNames.length)];

        // elegir palabra
        const words = categories[selectedCategory];
        const selectedWord = words[Math.floor(Math.random() * words.length)];

        playerIds.forEach(id => {
            room.players[id].role = id === impostorId ? "impostor" : "amigo";

            if (id === impostorId) {
                io.to(id).emit("card", {
                    role: "impostor",
                    category: selectedCategory
                });
            } else {
                io.to(id).emit("card", {
                    role: "amigo",
                    category: selectedCategory,
                    word: selectedWord
                });
            }
        });
    });

    socket.on("startVoting", (code) => {
        const room = rooms[code];
        if (!room) return;

        room.votes = {};
        room.phase = "voting";

        io.to(code).emit("votingStarted", {
            players: room.players
        });
    });

    socket.on("vote", ({ code, targetId }) => {
        const room = rooms[code];
        if (!room || room.phase !== "voting") return;

        room.votes[socket.id] = targetId;

        // si todos ya votaron
        if (Object.keys(room.votes).length === Object.keys(room.players).length) {
            finishVoting(code);
        }
    });

    socket.on("disconnect", () => {
        for (const code in rooms) {
            if (rooms[code].players[socket.id]) {
                delete rooms[code].players[socket.id];

                if (Object.keys(rooms[code].players).length === 0) {
                    delete rooms[code];
                } else {
                    io.to(code).emit("roomUpdate", rooms[code]);
                }
            }
        }
    });
});

function finishVoting(code) {
    const room = rooms[code];
    if (!room) return;

    const voteCount = {};
    let expelledId = null;
    let maxVotes = 0;
    let tie = false;

    // contar votos
    Object.values(room.votes).forEach(targetId => {
        voteCount[targetId] = (voteCount[targetId] || 0) + 1;

        if (voteCount[targetId] > maxVotes) {
            maxVotes = voteCount[targetId];
            expelledId = targetId;
            tie = false;
        } else if (voteCount[targetId] === maxVotes) {
            tie = true;
        }
    });

    // empate → nadie expulsado
    if (tie) {
        room.votes = {};
        room.phase = "game";
        io.to(code).emit("votingResult", { tie: true });
        return;
    }

    const wasImpostor = room.players[expelledId]?.role === "impostor";

    // expulsar jugador
    delete room.players[expelledId];

    io.to(code).emit("votingResult", {
        tie: false,
        expelled: room.players[expelledId]?.nickname || "Jugador",
        wasImpostor
    });

    room.votes = {};
    room.phase = "game";

    // verificar victoria
    const players = Object.keys(room.players);
    const impostors = players.filter(
        id => room.players[id].role === "impostor"
    );

    if (impostors.length === 0) {
        io.to(code).emit("gameEnded", { winner: "amigos" });
        room.phase = "ended";
    } else if (impostors.length >= players.length - impostors.length) {
        io.to(code).emit("gameEnded", { winner: "impostores" });
        room.phase = "ended";
    }
}


server.listen(3000, () => {
    console.log("Servidor Impostor corriendo en http://localhost:3000");
});
