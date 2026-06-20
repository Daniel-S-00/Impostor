import { describe, it, expect } from "vitest";
import { createRateLimiter, DEFAULT_RATE_LIMITS } from "./rate-limit.js";

describe("createRateLimiter", () => {
    it("allows up to max events inside the window", () => {
        let t = 0;
        const limit = createRateLimiter({ windowMs: 1000, max: 3, now: () => t });
        expect(limit("a")).toBe(true);
        expect(limit("a")).toBe(true);
        expect(limit("a")).toBe(true);
        expect(limit("a")).toBe(false);
    });

    it("resets after the window passes", () => {
        let t = 0;
        const limit = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
        expect(limit("a")).toBe(true);
        expect(limit("a")).toBe(false);
        t = 1001;
        expect(limit("a")).toBe(true);
    });

    it("tracks each key independently", () => {
        let t = 0;
        const limit = createRateLimiter({ windowMs: 1000, max: 1, now: () => t });
        expect(limit("a")).toBe(true);
        expect(limit("b")).toBe(true);
        expect(limit("a")).toBe(false);
        expect(limit("b")).toBe(false);
    });

    it("uses Date.now by default", () => {
        const limit = createRateLimiter({ windowMs: 60_000, max: 1 });
        expect(limit("a")).toBe(true);
        expect(limit("a")).toBe(false);
    });
});

describe("DEFAULT_RATE_LIMITS", () => {
    it("defines a limit for every game event", () => {
        for (const name of ["createRoom", "joinRoom", "setImpostorCount", "startGame", "startVoting", "vote"]) {
            const cfg = DEFAULT_RATE_LIMITS[name];
            expect(cfg).toBeDefined();
            expect(cfg.windowMs).toBeGreaterThan(0);
            expect(cfg.max).toBeGreaterThan(0);
        }
    });
});
