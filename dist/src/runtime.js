/**
 * Runtime dependency injection for Bitrix24 plugin
 * Allows the plugin to access OpenClaw runtime services
 */
let runtime = null;
export function setBitrix24Runtime(rt) {
    runtime = rt;
}
export function getBitrix24Runtime() {
    if (!runtime) {
        throw new Error("Bitrix24 runtime not initialized. Did you call register()?");
    }
    return runtime;
}
