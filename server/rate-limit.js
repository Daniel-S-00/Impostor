export function createRateLimiter({ windowMs = 500, max = 1, now = Date.now } = {}) {
    const timestamps = new Map();

    return function check(key) {
        const t = now();
        const cutoff = t - windowMs;
        const previous = timestamps.get(key) || [];
        const recent = previous.filter((ts) => ts > cutoff);

        if (recent.length >= max) {
            timestamps.set(key, recent);
            return false;
        }

        recent.push(t);
        timestamps.set(key, recent);
        return true;
    };
}

export const DEFAULT_RATE_LIMITS = Object.freeze({
    createRoom: { windowMs: 1000, max: 1 },
    joinRoom: { windowMs: 1000, max: 1 },
    setImpostorCount: { windowMs: 1000, max: 3 },
    startGame: { windowMs: 1000, max: 1 },
    startVoting: { windowMs: 1000, max: 1 },
    vote: { windowMs: 1000, max: 1 }
});
