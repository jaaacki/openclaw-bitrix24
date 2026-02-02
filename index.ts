/**
 * Bitrix24 Channel Plugin - Entry Point
 * Registers the plugin with OpenClaw
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { bitrix24Plugin } from "./src/channel.js";
import { setBitrix24Runtime } from "./src/runtime.js";
import { registerBitrix24Webhook } from "./src/webhook.js";

const plugin = {
  id: "openclaw-bitrix24",
  name: "Bitrix24",
  description: "Bitrix24 channel plugin - two-way messaging via webhooks",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setBitrix24Runtime(api.runtime);

    // Register webhook route for inbound messages
    registerBitrix24Webhook(api);

    // Register channel plugin
    api.registerChannel({ plugin: bitrix24Plugin });

    api.logger.info("[Bitrix24] Plugin registered with webhook handler");
  },
};

export default plugin;