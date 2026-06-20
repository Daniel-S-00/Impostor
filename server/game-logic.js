export const ROLES = Object.freeze({
    IMPOSTOR: "impostor",
    CREWMATE: "crewmate"
});

export const PHASES = Object.freeze({
    LOBBY: "lobby",
    GAME: "game",
    VOTING: "voting"
});

export const WINNERS = Object.freeze({
    CREW: "crew",
    IMPOSTORS: "impostors"
});

export const DEFAULT_IMPOSTOR_COUNT = 1;
export const MIN_IMPOSTOR_COUNT = 1;
export const MAX_IMPOSTOR_COUNT = 3;
export const ROOM_CODE_LENGTH = 4;

export function clampImpostorCount(value, playerCount) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_IMPOSTOR_COUNT;
    const safePlayerCount = Math.max(2, playerCount || 2);
    const maxAllowed = Math.max(MIN_IMPOSTOR_COUNT, Math.min(MAX_IMPOSTOR_COUNT, safePlayerCount - 1));
    return Math.max(MIN_IMPOSTOR_COUNT, Math.min(parsed, maxAllowed));
}

export function generateRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
}

export function pickImpostors(playerIds, n) {
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
        throw new Error("pickImpostors: playerIds must be a non-empty array");
    }
    const count = Math.max(MIN_IMPOSTOR_COUNT, Math.min(n, playerIds.length));
    const pool = [...playerIds];
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
}

export function pickWord(wordsMap) {
    if (!wordsMap || typeof wordsMap !== "object") {
        throw new Error("pickWord: wordsMap is required");
    }
    const categoryKeys = Object.keys(wordsMap);
    if (categoryKeys.length === 0) {
        throw new Error("pickWord: wordsMap has no categories");
    }
    const category = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
    const words = wordsMap[category];
    if (!Array.isArray(words) || words.length === 0) {
        throw new Error(`pickWord: category "${category}" has no words`);
    }
    const word = words[Math.floor(Math.random() * words.length)];
    return { category, word };
}

export function tallyVotes(votes) {
    const counts = {};
    for (const targetId of Object.values(votes || {})) {
        if (!targetId) continue;
        counts[targetId] = (counts[targetId] || 0) + 1;
    }

    const entries = Object.entries(counts);
    if (entries.length === 0) {
        return { expelledId: null, tie: false, counts: {} };
    }

    entries.sort((a, b) => b[1] - a[1]);
    const [topId, topCount] = entries[0];
    const tiedWithTop = entries.filter(([, c]) => c === topCount);

    if (tiedWithTop.length > 1) {
        return { expelledId: null, tie: true, counts };
    }

    return { expelledId: topId, tie: false, counts };
}

export function checkWin(players) {
    if (!players || typeof players !== "object") return null;
    const ids = Object.keys(players);
    if (ids.length === 0) return null;

    const impostorsAlive = ids.filter((id) => players[id].role === ROLES.IMPOSTOR);
    const crewAlive = ids.filter((id) => players[id].role === ROLES.CREWMATE);

    if (impostorsAlive.length === 0) {
        return { winner: WINNERS.CREW, reason: "all_impostors_expelled" };
    }
    if (impostorsAlive.length >= crewAlive.length) {
        return { winner: WINNERS.IMPOSTORS, reason: "impostors_outnumber_crew" };
    }
    return null;
}

export function isValidNickname(nickname) {
    return typeof nickname === "string"
        && nickname.trim().length >= 1
        && nickname.trim().length <= 20;
}

export function isValidRoomCode(code) {
    return typeof code === "string"
        && /^[A-Z0-9]{4}$/.test(code);
}

export function publicRoomState(room) {
    return {
        code: room.code,
        host: room.host,
        phase: room.phase,
        impostorCount: room.impostorCount,
        currentRound: room.currentRound,
        players: Object.fromEntries(
            Object.entries(room.players).map(([id, p]) => [id, { nickname: p.nickname }])
        )
    };
}
