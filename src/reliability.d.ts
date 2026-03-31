export function createSingleDeliveryGate(): {
  claim(label: string): boolean;
  winner(): string | null;
  hasWinner(): boolean;
};

export function createSerializedRateLimiter(options?: {
  minWait?: number;
  maxDepth?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): () => Promise<void>;
