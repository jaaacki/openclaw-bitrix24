import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import {
  readRequestBody,
  RequestBodyTimeoutError,
  RequestBodyTooLargeError,
} from "../src/request-body.js";
import {
  createSerializedRateLimiter,
  createSingleDeliveryGate,
} from "../src/reliability.js";

test("readRequestBody returns the request body text", async () => {
  const req = new PassThrough();
  const bodyPromise = readRequestBody(req, { maxBytes: 32, timeoutMs: 50 });

  req.write("hello ");
  req.end("world");

  await assert.doesNotReject(bodyPromise);
  assert.equal(await bodyPromise, "hello world");
});

test("readRequestBody rejects with 413 when the body exceeds the limit", async () => {
  const req = new PassThrough();
  const bodyPromise = readRequestBody(req, { maxBytes: 4, timeoutMs: 50 });

  req.write("hello");

  await assert.rejects(bodyPromise, (error) => {
    assert.ok(error instanceof RequestBodyTooLargeError);
    assert.equal(error.statusCode, 413);
    return true;
  });
});

test("readRequestBody rejects with 408 when the body stalls", async () => {
  const req = new PassThrough();
  const bodyPromise = readRequestBody(req, { maxBytes: 32, timeoutMs: 20 });

  await assert.rejects(bodyPromise, (error) => {
    assert.ok(error instanceof RequestBodyTimeoutError);
    assert.equal(error.statusCode, 408);
    return true;
  });
});

test("createSingleDeliveryGate lets only the first claimant win", () => {
  const gate = createSingleDeliveryGate();

  assert.equal(gate.claim("dispatch"), true);
  assert.equal(gate.claim("timeout"), false);
  assert.equal(gate.winner(), "dispatch");
});

test("createSerializedRateLimiter serializes concurrent callers", async () => {
  let now = 1000;
  const waits = [];
  const limiter = createSerializedRateLimiter({
    minWait: 10,
    maxDepth: 5,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });

  await Promise.all([limiter(), limiter(), limiter()]);

  assert.deepEqual(waits, [10, 10]);
});

test("createSerializedRateLimiter rejects when queue depth exceeds the cap", async () => {
  let now = 0;
  let releaseFirstSleep;
  let firstSleep = true;
  const limiter = createSerializedRateLimiter({
    minWait: 10,
    maxDepth: 2,
    now: () => now,
    sleep: (ms) => {
      now += ms;
      if (firstSleep) {
        firstSleep = false;
        return new Promise((resolve) => {
          releaseFirstSleep = resolve;
        });
      }
      return Promise.resolve();
    },
  });

  const first = limiter();
  const second = limiter();

  await assert.rejects(limiter(), /backpressure/i);

  releaseFirstSleep?.();
  await Promise.all([first, second]);
});
