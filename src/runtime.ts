/**
 * Runtime dependency injection for Bitrix24 plugin
 * Allows the plugin to access OpenClaw runtime services
 *
 * @module runtime
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setBitrix24Runtime(rt: PluginRuntime): void {
  runtime = rt;
}

export function getBitrix24Runtime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Bitrix24 runtime not initialized. Did you call register()?");
  }
  return runtime;
}
