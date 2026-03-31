# Reliability Consolidation Design

## Goal

Replace the three overlapping reliability PRs with one clean branch built on `main`, keeping the fixes that improve correctness and dropping or rewriting the parts that are incomplete or misleading.

## Chosen Approach

Start from `main` and port the good changes from PRs `#1`, `#2`, and `#3` into one integration branch. Do not merge any PR branch directly. This avoids carrying forward overlapping edits in `src/webhook.ts` and `src/client.ts` and lets the final branch present one coherent diff.

Because this machine is running Node `18.16.0` and the repo's transitive dependency graph now pulls packages that require Node 20+, the validation path will not rely on a full OpenClaw install. Instead, the branch will add small runtime-safe helper modules that can be tested with Node's built-in test runner.

## Fixes To Keep

- From `#1`: move the auth gate ahead of heavy message handling and keep the API `AbortController` timeout baseline.
- From `#3`: keep the serialized `waitForRateLimit()` fix and the corrected `sendMultipleFiles()` attachment assembly.
- From `#2`: keep the immediate webhook ACK, masked logging, safer temp-file cleanup, safer subprocess invocation, download/body size caps, deduplicated account IDs, and `chatId` propagation for file sends.

## Fixes To Rewrite

- Rewrite the duplicate-delivery guard so it prevents both late-starting and already-started deliveries from sending a second message after timeout handling wins.
- Rewrite request-body parsing so size-limit and timeout failures map to correct HTTP responses instead of collapsing into a generic `500`.

## Implementation Shape

- Add a helper for webhook request-body reading with explicit `413` and `408` errors.
- Add a helper for single-winner delivery semantics and serialized rate limiting.
- Wire `src/webhook.ts` and `src/client.ts` to those helpers.
- Add self-contained regression tests under `tests/` using `node:test`.
- Update `package.json` so the new tests are runnable in this environment.

## Success Criteria

- One integration branch contains the kept fixes and corrected shortcomings from the three PRs.
- Oversized request bodies return `413`.
- Slow request bodies return `408`.
- Timed-out dispatches cannot later send a second real reply.
- Concurrent API calls are serialized safely.
- Mixed file and URL attachments are preserved.

## Risks

- The repo still lacks a full installable local runtime under Node 18, so verification is limited to the new self-contained regression tests plus careful static review of the integration points.
