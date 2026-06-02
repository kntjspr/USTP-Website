// In-memory rate limiter for Vercel function handlers.
//
// Limitations: state lives in the warm instance only. A user hitting
// multiple cold/warm instances gets effectively reset counts; this is
// best-effort spam mitigation, not a real DDoS shield. For hard limits
// use a shared store (Vercel KV / Upstash Redis) keyed the same way.

const buckets = new Map();

function getClientKey(req) {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0])
        || req.headers['x-real-ip']
        || req.socket?.remoteAddress
        || 'unknown';
    return String(ip).trim();
}

export function rateLimit({ windowMs, max, keyPrefix }) {
    return function check(req, res) {
        const now = Date.now();
        const key = `${keyPrefix || ''}:${getClientKey(req)}`;
        const bucket = buckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return { allowed: true };
        }

        if (bucket.count >= max) {
            const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            res.status(429).json({ error: 'Too many requests' });
            return { allowed: false };
        }

        bucket.count += 1;
        return { allowed: true };
    };
}

// Periodically prune expired buckets so the map doesn't grow forever.
// Only attach on first import in this warm instance.
if (!globalThis.__rateLimitPruneInstalled) {
    globalThis.__rateLimitPruneInstalled = true;
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of buckets) {
            if (v.resetAt <= now) buckets.delete(k);
        }
    }, 60_000).unref?.();
}
