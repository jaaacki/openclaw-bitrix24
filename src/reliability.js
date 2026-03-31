export function createSingleDeliveryGate() {
  let claimedBy = null;

  return {
    claim(label) {
      if (claimedBy !== null) {
        return false;
      }
      claimedBy = label;
      return true;
    },
    winner() {
      return claimedBy;
    },
    hasWinner() {
      return claimedBy !== null;
    },
  };
}

export function createSerializedRateLimiter({
  minWait = 1000,
  maxDepth = Number.POSITIVE_INFINITY,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let depth = 0;
  let lastRequestTime = 0;
  let tail = Promise.resolve();

  return async function waitForRateLimit() {
    if (depth >= maxDepth) {
      throw new Error(
        `Rate limit queue depth (${depth}) exceeds cap of ${maxDepth} - backpressure`,
      );
    }

    depth += 1;
    const wait = tail.then(async () => {
      const elapsed = now() - lastRequestTime;
      if (elapsed < minWait) {
        await sleep(minWait - elapsed);
      }
      lastRequestTime = now();
    });

    tail = wait.catch(() => {});

    try {
      await wait;
    } finally {
      depth -= 1;
    }
  };
}
