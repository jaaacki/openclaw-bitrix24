/**
 * Bitrix24 Channel Plugin - Entry Point
 * Registers the plugin with OpenClaw
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: any;
    register(api: OpenClawPluginApi): void;
};
export default plugin;
//# sourceMappingURL=index.d.ts.map