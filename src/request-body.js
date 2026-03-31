class RequestBodyError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

export class RequestBodyTooLargeError extends RequestBodyError {
  constructor(maxBytes) {
    super(`Request body exceeds maximum allowed size of ${maxBytes} bytes`, 413);
  }
}

export class RequestBodyTimeoutError extends RequestBodyError {
  constructor(timeoutMs) {
    super(`Request body read timed out after ${timeoutMs}ms`, 408);
  }
}

export function readRequestBody(
  req,
  { maxBytes = 512 * 1024, timeoutMs = 10_000, encoding = "utf8" } = {},
) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteCount = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
      req.off("close", onClose);
    };

    const finishResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const finishReject = (error, destroy = false) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (destroy && typeof req.destroy === "function" && !req.destroyed) {
        try {
          req.destroy();
        } catch {
          // Ignore secondary destroy failures while reporting the original error.
        }
      }
      reject(error);
    };

    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteCount += buffer.length;
      if (byteCount > maxBytes) {
        finishReject(new RequestBodyTooLargeError(maxBytes), true);
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = () => {
      finishResolve(Buffer.concat(chunks).toString(encoding));
    };

    const onError = (error) => {
      finishReject(error);
    };

    const onAborted = () => {
      finishReject(new Error("Request body stream aborted"));
    };

    const onClose = () => {
      if (!settled && !req.readableEnded) {
        finishReject(new Error("Request body stream closed before completion"));
      }
    };

    const timer = setTimeout(() => {
      finishReject(new RequestBodyTimeoutError(timeoutMs), true);
    }, timeoutMs);

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
    req.on("close", onClose);
  });
}
