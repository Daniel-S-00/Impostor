import { describe, it, expect } from "vitest";
import {
    ROLES,
    PHASES,
    WINNERS,
    clampImpostorCount,
    generateRoomCode,
    pickImpostors,
    pickWord,
    tallyVotes,
    checkWin,
    isValidNickname,
    isValidRoomCode,
    publicRoomState
} from "./game-logic.js";

describe("generateRoomCode", () => {
    it("returns a 4-character alphanumeric uppercase string", () => {
        for (let i = 0; i < 100; i += 1) {
            const code = generateRoomCode();
            expect(code).toMatch(/^[A-Z0-9]{4}$/);
        }
    });
});

describe("clampImpostorCount", () => {
    it("defaults to 1 when value is not a number", () => {
        expect(clampImpostorCount(undefined, 5)).toBe(1);
        expect(clampImpostorCount("abc", 5)).toBe(1);
    });

    it("never goes below 1", () => {
        expect(clampImpostorCount(0, 5)).toBe(1);
        expect(clampImpostorCount(-3, 5)).toBe(1);
    });

    it("never exceeds MAX_IMPOSTOR_COUNT (3) regardless of player count", () => {
        expect(clampImpostorCount(10, 20)).toBe(3);
    });

    it("never exceeds playerCount - 1 (leaving at least one crewmate)", () => {
        expect(clampImpostorCount(5, 3)).toBe(2);
    });
});

describe("pickImpostors", () => {
    const ids = ["a", "b", "c", "d", "e"];

    it("returns exactly n unique ids", () => {
        const result = pickImpostors(ids, 2);
        expect(result).toHaveLength(2);
        expect(new Set(result).size).toBe(2);
        for (const id of result) {
            expect(ids).toContain(id);
        }
    });

    it("returns all ids when n equals the player count", () => {
        const result = pickImpostors(ids, ids.length);
        expect(result.sort()).toEqual([...ids].sort());
    });

    it("clamps n to playerIds.length when n is too large", () => {
        const result = pickImpostors(ids, 100);
        expect(result).toHaveLength(ids.length);
    });

    it("throws when playerIds is empty", () => {
        expect(() => pickImpostors([], 1)).toThrow();
        expect(() => pickImpostors(null, 1)).toThrow();
    });

    it("does not mutate the input array", () => {
        const original = [...ids];
        pickImpostors(ids, 3);
        expect(ids).toEqual(original);
    });
});

describe("pickWord", () => {
    const words = {
        Animales: ["Perro", "Gato"],
        Lugares: ["Playa", "Montaña"]
    };

    it("returns a category and a word from that category", () => {
        const result = pickWord(words);
        expect(Object.keys(words)).toContain(result.category);
        expect(words[result.category]).toContain(result.word);
    });

    it("throws when words map is empty", () => {
        expect(() => pickWord({})).toThrow();
        expect(() => pickWord(null)).toThrow();
    });
});

describe("tallyVotes", () => {
    it("returns the player with the most votes on a clear winner", () => {
        const result = tallyVotes({ a: "x", b: "x", c: "y" });
        expect(result.tie).toBe(false);
        expect(result.expelledId).toBe("x");
        expect(result.counts).toEqual({ x: 2, y: 1 });
    });

    it("reports a tie when top two candidates are equal", () => {
        const result = tallyVotes({ a: "x", b: "y" });
        expect(result.tie).toBe(true);
        expect(result.expelledId).toBeNull();
    });

    it("reports a tie when more than two candidates are tied at the top", () => {
        const result = tallyVotes({ a: "x", b: "y", c: "z" });
        expect(result.tie).toBe(true);
    });

    it("returns an empty result for no votes", () => {
        const result = tallyVotes({});
        expect(result.tie).toBe(false);
        expect(result.expelledId).toBeNull();
        expect(result.counts).toEqual({});
    });
});

describe("checkWin", () => {
    it("returns crew win when no impostors remain", () => {
        const players = {
            a: { role: ROLES.CREWMATE },
            b: { role: ROLES.CREWMATE }
        };
        const win = checkWin(players);
        expect(win).not.toBeNull();
        expect(win.winner).toBe(WINNERS.CREW);
    });

    it("returns impostors win when impostors >= crew", () => {
        const players = {
            a: { role: ROLES.IMPOSTOR },
            b: { role: ROLES.CREWMATE }
        };
        const win = checkWin(players);
        expect(win).not.toBeNull();
        expect(win.winner).toBe(WINNERS.IMPOSTORS);
    });

    it("returns null when the game should continue", () => {
        const players = {
            a: { role: ROLES.IMPOSTOR },
            b: { role: ROLES.CREWMATE },
            c: { role: ROLES.CREWMATE }
        };
        expect(checkWin(players)).toBeNull();
    });

    it("returns null for an empty player list", () => {
        expect(checkWin({})).toBeNull();
    });

    it("ignores expelled players when counting impostors and crew", () => {
        const players = {
            a: { role: ROLES.IMPOSTOR, expelled: true },
            b: { role: ROLES.CREWMATE },
            c: { role: ROLES.CREWMATE }
        };
        const win = checkWin(players);
        expect(win).not.toBeNull();
        expect(win.winner).toBe(WINNERS.CREW);
    });

    it("returns null when every active player is gone (degenerate, unexpelled in lobby)", () => {
        const players = {
            a: { role: ROLES.IMPOSTOR, expelled: true },
            b: { role: ROLES.CREWMATE, expelled: true }
        };
        expect(checkWin(players)).toBeNull();
    });

    it("reports impostors win when only impostors are still active", () => {
        const players = {
            a: { role: ROLES.IMPOSTOR },
            b: { role: ROLES.CREWMATE, expelled: true }
        };
        const win = checkWin(players);
        expect(win).not.toBeNull();
        expect(win.winner).toBe(WINNERS.IMPOSTORS);
    });

    it("reports impostors win when active impostors >= active crew", () => {
        const players = {
            a: { role: ROLES.IMPOSTOR },
            b: { role: ROLES.CREWMATE },
            c: { role: ROLES.CREWMATE, expelled: true }
        };
        const win = checkWin(players);
        expect(win).not.toBeNull();
        expect(win.winner).toBe(WINNERS.IMPOSTORS);
    });

    it("returns null when the game should still continue", () => {
        const players = {
            a: { role: ROLES.IMPOSTOR },
            b: { role: ROLES.CREWMATE },
            c: { role: ROLES.CREWMATE }
        };
        expect(checkWin(players)).toBeNull();
    });
});

describe("isValidNickname", () => {
    it("accepts non-empty nicknames up to 20 characters", () => {
        expect(isValidNickname("Ana")).toBe(true);
        expect(isValidNickname("a".repeat(20))).toBe(true);
    });

    it("rejects empty or whitespace nicknames", () => {
        expect(isValidNickname("")).toBe(false);
        expect(isValidNickname("   ")).toBe(false);
    });

    it("rejects nicknames over 20 characters", () => {
        expect(isValidNickname("a".repeat(21))).toBe(false);
    });

    it("rejects non-string values", () => {
        expect(isValidNickname(null)).toBe(false);
        expect(isValidNickname(42)).toBe(false);
    });
});

describe("isValidRoomCode", () => {
    it("accepts 4-character uppercase alphanumeric codes", () => {
        expect(isValidRoomCode("ABCD")).toBe(true);
        expect(isValidRoomCode("1234")).toBe(true);
        expect(isValidRoomCode("A2B3")).toBe(true);
    });

    it("rejects codes of the wrong length", () => {
        expect(isValidRoomCode("ABC")).toBe(false);
        expect(isValidRoomCode("ABCDE")).toBe(false);
    });

    it("rejects lowercase or special characters", () => {
        expect(isValidRoomCode("abcd")).toBe(false);
        expect(isValidRoomCode("AB-D")).toBe(false);
    });
});

describe("publicRoomState", () => {
    it("does not leak player roles or the secret word", () => {
        const room = {
            code: "ROOM",
            host: "h",
            phase: PHASES.GAME,
            impostorCount: 1,
            currentRound: 1,
            word: "Secreto",
            category: "Animales",
            impostorIds: ["h"],
            votes: {},
            players: {
                h: { nickname: "Host", role: ROLES.IMPOSTOR },
                o: { nickname: "Otro", role: ROLES.CREWMATE }
            }
        };
        const pub = publicRoomState(room);
        expect(pub).not.toHaveProperty("word");
        expect(pub).not.toHaveProperty("impostorIds");
        expect(pub.players.h).not.toHaveProperty("role");
        expect(pub.players.h.nickname).toBe("Host");
        expect(pub.players.o.nickname).toBe("Otro");
    });

    it("exposes the list of voters (ids that have cast a vote)", () => {
        const room = {
            code: "ROOM",
            host: "h",
            phase: PHASES.GAME,
            impostorCount: 1,
            currentRound: 1,
            word: "Secreto",
            category: "Animales",
            impostorIds: ["h"],
            votes: { a: "b", b: "a" },
            players: {
                h: { nickname: "Host" },
                a: { nickname: "A" },
                b: { nickname: "B" }
            }
        };
        const pub = publicRoomState(room);
        expect(pub.voters.sort()).toEqual(["a", "b"]);
    });

    it("returns an empty voters array when no one has voted", () => {
        const room = {
            code: "ROOM",
            host: "h",
            phase: PHASES.GAME,
            impostorCount: 1,
            currentRound: 1,
            votes: {},
            players: { h: { nickname: "Host" } }
        };
        expect(publicRoomState(room).voters).toEqual([]);
    });

    it("exposes the expelled flag per player", () => {
        const room = {
            code: "ROOM",
            host: "h",
            phase: PHASES.GAME,
            impostorCount: 1,
            currentRound: 1,
            votes: {},
            players: {
                h: { nickname: "Host" },
                o: { nickname: "Otro", expelled: true }
            }
        };
        const pub = publicRoomState(room);
        expect(pub.players.h.expelled).toBe(false);
        expect(pub.players.o.expelled).toBe(true);
    });
});
