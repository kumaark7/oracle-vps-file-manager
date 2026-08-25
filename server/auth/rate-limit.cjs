function createAttemptLimiter({ maxAttempts, windowMs, blockMs }) {
  const attempts = new Map();

  function take(key) {
    const now = Date.now();
    let entry = attempts.get(key);

    if (!entry || now - entry.windowStartedAt >= windowMs) {
      entry = {
        count: 0,
        windowStartedAt: now,
        blockedUntil: 0
      };
    }

    if (entry.blockedUntil > now) {
      attempts.set(key, entry);
      return false;
    }

    entry.count += 1;
    if (entry.count >= maxAttempts) {
      entry.blockedUntil = now + blockMs;
    }

    attempts.set(key, entry);
    return true;
  }

  function reset(key) {
    attempts.delete(key);
  }

  return { take, reset };
}

module.exports = { createAttemptLimiter };
