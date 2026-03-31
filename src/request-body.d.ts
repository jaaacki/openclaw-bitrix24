import type { IncomingMessage } from "node:http";

export class RequestBodyTooLargeError extends Error {
  statusCode: number;
  constructor(maxBytes: number);
}

export class RequestBodyTimeoutError extends Error {
  statusCode: number;
  constructor(timeoutMs: number);
}

export function readRequestBody(
  req: IncomingMessage,
  options?: {
    maxBytes?: number;
    timeoutMs?: number;
    encoding?: BufferEncoding;
  },
): Promise<string>;
