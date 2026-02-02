/**
 * Bitrix24 Webhook Handler
 * Handles incoming webhook events from Bitrix24
 */
import { type OpenClawPluginApi } from "openclaw/plugin-sdk";
/**
 * Register webhook route for Bitrix24
 */
export declare function registerBitrix24Webhook(api: OpenClawPluginApi): () => void;
/**
 * Get webhook URL for Bitrix24 configuration
 */
export declare function getWebhookUrl(): string;
//# sourceMappingURL=webhook.d.ts.map