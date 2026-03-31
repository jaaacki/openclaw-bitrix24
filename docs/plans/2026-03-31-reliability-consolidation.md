# Reliability Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate the valid reliability fixes from PRs `#1`, `#2`, and `#3` into one mergeable branch with regression tests.

**Architecture:** Introduce small helper modules for request-body handling and concurrency guards, then route `src/webhook.ts` and `src/client.ts` through those helpers. Use Node's built-in test runner so verification works even though the full dependency tree does not install under Node 18 in this environment.

**Tech Stack:** Existing TypeScript source, ESM JavaScript helper modules, `node:test`, `node:assert/strict`

---

### Task 1: Add Self-Contained Reliability Tests

**Files:**
- Create: `tests/reliability.test.mjs`
- Modify: `package.json`

**Step 1: Write the failing tests**

Cover:
- body reader returns text for normal request bodies
- body reader rejects with `413` when size cap is exceeded
- body reader rejects with `408` when the body stalls past timeout
- delivery guard allows only one winner
- serialized rate limiter prevents concurrent callers from sharing the same slot

**Step 2: Run test to verify it fails**

Run: `node --test tests/reliability.test.mjs`
Expected: FAIL because the helper modules do not exist yet

**Step 3: Add a runnable test script**

Set `package.json` `test` to `node --test tests/reliability.test.mjs`

**Step 4: Run the test command again**

Run: `npm test`
Expected: FAIL for missing helper implementations

### Task 2: Add Helper Modules For Body Reading And Concurrency Guards

**Files:**
- Create: `src/request-body.js`
- Create: `src/reliability.js`
- Test: `tests/reliability.test.mjs`

**Step 1: Implement the request-body helper**

Add:
- `readRequestBody(req, { maxBytes, timeoutMs })`
- `RequestBodyTooLargeError`
- `RequestBodyTimeoutError`

Behavior:
- accumulate UTF-8 body data
- reject with `413` when byte count exceeds the limit
- reject with `408` when the timer fires before `end`
- clean up timer/listeners on resolution

**Step 2: Implement the concurrency helper**

Add:
- `createSingleDeliveryGate()`
- `createSerializedRateLimiter({ minWait, maxDepth, now, sleep })`

Behavior:
- one caller can permanently win delivery rights
- later attempts are rejected or skipped
- rate limiter serializes slot acquisition and enforces queue depth caps

**Step 3: Run tests**

Run: `npm test`
Expected: PASS for helper-level behaviors

### Task 3: Integrate Helpers Into Webhook Flow

**Files:**
- Modify: `src/webhook.ts`
- Test: `tests/reliability.test.mjs`

**Step 1: Replace inline body parsing**

Use `readRequestBody()` inside `parseBody()` or directly inside the webhook handler so oversized and stalled reads map to `413` and `408`.

**Step 2: Replace the boolean delivery guard**

Use `createSingleDeliveryGate()` in both message and command flows so timeout fallback and the real delivery path cannot both send.

**Step 3: Preserve the good hardening from PR #2**

Keep:
- immediate `200` ACK
- masked secret logging
- early auth gate
- existing temp-file cleanup and safer subprocess code

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

### Task 4: Integrate Helpers Into Client Flow

**Files:**
- Modify: `src/client.ts`
- Modify: `src/channel.ts`
- Modify: `src/accounts.ts`
- Test: `tests/reliability.test.mjs`

**Step 1: Replace inline rate-limit state**

Wire `Bitrix24Client` to `createSerializedRateLimiter()` while preserving per-domain sharing and queue caps.

**Step 2: Keep the PR #3 attachment fix**

Ensure `sendMultipleFiles()` preserves both `MYFILES` and `URLS`.

**Step 3: Keep the supporting PR #2 cleanup**

Preserve:
- file send `chatId`
- deduplicated account IDs
- masked webhook logging

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

### Task 5: Final Verification And Branch Summary

**Files:**
- Modify: `README.md` only if behavior notes are needed

**Step 1: Run verification**

Run:
- `npm test`
- `git diff --stat main...HEAD`

Expected:
- tests pass
- final diff reflects one integrated solution, not three overlapping ones

**Step 2: Prepare branch summary**

Document:
- which fixes were kept from each PR
- which shortcomings were corrected
- which old PRs should be closed in favor of the new branch
