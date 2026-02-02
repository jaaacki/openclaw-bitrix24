/**
 * Bitrix24 Webhook Handler
 * Handles incoming webhook events from Bitrix24
 */
import { registerPluginHttpRoute, getChatChannelMeta, } from "openclaw/plugin-sdk";
import { getBitrix24Runtime } from "./runtime.js";
import { resolveBitrix24Account } from "./accounts.js";
const meta = getChatChannelMeta("bitrix24");
/**
 * Register webhook route for Bitrix24
 */
export function registerBitrix24Webhook(api) {
    unregister = registerPluginHttpRoute({
        pluginId: "bitrix24",
        path: "/chan/bitrix24/webhook",
        fallbackPath: "/chan/bitrix24/webhook",
        handler: handleBitrix24Webhook,
        log: (msg) => api.runtime.logging.debug(msg),
        registry: api.runtime.registry,
    });
    return unregister;
}
let unregister = null;
/**
 * Main webhook handler for Bitrix24 events
 */
async function handleBitrix24Webhook(req) {
    const log = getBitrix24Runtime().logging;
    try {
        // Parse secret from URL query params
        // req.url should be full URL, but we use a dummy base if relative
        const url = new URL(req.url, "http://localhost");
        const secret = url.searchParams.get("secret");
        // Parse request body
        const event = await req.json();
        log.debug(`[Bitrix24] Received webhook event: ${event.event}`);
        // Verify event structure
        if (!event.event || !event.data) {
            log.warn("[Bitrix24] Invalid webhook payload: missing event or data");
            return new Response(JSON.stringify({ error: "Invalid payload" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }
        // Handle different event types
        switch (event.event) {
            case "ONIMMESSAGEADD":
                await handleIncomingMessage(event, secret, log);
                break;
            case "ONIMCOMMANDADD":
                await handleIncomingCommand(event, secret, log);
                break;
            default:
                log.debug(`[Bitrix24] Unhandled event type: ${event.event}`);
        }
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
    catch (error) {
        log.error(`[Bitrix24] Webhook processing error: ${String(error)}`);
        return new Response(JSON.stringify({ error: "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
/**
 * Verify webhook secret against account config
 */
async function verifySecret(secret, log) {
    // Resolve account configuration
    const cfg = await getBitrix24Runtime().config.readConfigFile();
    // Currently only supporting default account for inbound webhooks
    // TODO: Support multi-account resolution via query param or domain check
    const account = resolveBitrix24Account({ cfg, accountId: "default" });
    if (!account.domain || !account.webhookSecret) {
        log.error("[Bitrix24] Bitrix24 account not configured");
        return { verified: false };
    }
    // Strict check: Secret must be present and match
    if (!secret || secret !== account.webhookSecret) {
        log.warn(`[Bitrix24] Webhook secret verification failed. Received: ${secret ? "***" : "empty"}`);
        return { verified: false, account };
    }
    return { verified: true, account };
}
/**
 * Handle incoming message event (ONIMMESSAGEADD)
 */
async function handleIncomingMessage(event, secret, log) {
    const { data } = event;
    // Extract message details
    const fromUserId = data.AUTHOR_ID ?? data.FROM_USER_ID ?? data.USER_ID;
    const toUserId = data.TO_USER_ID;
    const messageText = data.MESSAGE ?? "";
    if (!fromUserId) {
        log.warn("[Bitrix24] Message event missing author ID");
        return;
    }
    if (!messageText?.trim() && !data.ATTACHMENTS?.length) {
        log.debug("[Bitrix24] Empty message, skipping");
        return;
    }
    // Verify secret
    const { verified, account } = await verifySecret(secret, log);
    if (!verified)
        return;
    log.debug(`[Bitrix24] Incoming message from user ${fromUserId} to ${toUserId || "unknown"}: ${messageText?.slice(0, 100)}`);
    // Get channel config for processing
    const accountKey = `${meta.id}:${account.accountId || "default"}`;
    // Create message envelope for OpenClaw
    const envelope = {
        channel: "bitrix24",
        channelAccount: account.accountId || "default",
        fromChannelUser: fromUserId.toString(),
        fromName: `User${fromUserId}`,
        toChannelUser: toUserId?.toString() || account.userId?.toString() || "",
        toChannelUserId: toUserId?.toString() ?? account.userId?.toString() ?? "",
        timestamp: new Date().toISOString(),
        channelMessageId: data.MESSAGE_ID?.toString() || "",
        text: messageText,
        attachments: data.ATTACHMENTS || [],
        raw: event,
    };
    // Deliver to OpenClaw via channel delivery
    try {
        await getBitrix24Runtime().channel.delivery.deliverInboundMessage({
            envelope,
            cfg: await getBitrix24Runtime().config.readConfigFile(),
            channelKey: accountKey,
        });
        log.info(`[Bitrix24] Delivered message from ${fromUserId} to OpenClaw`);
    }
    catch (error) {
        log.error(`[Bitrix24] Failed to deliver message to OpenClaw: ${String(error)}`);
    }
}
/**
 * Handle incoming command event (ONIMCOMMANDADD)
 */
async function handleIncomingCommand(event, secret, log) {
    const { data } = event;
    // Extract command details
    const fromUserId = data.COMMAND_USER_ID ?? data.AUTHOR_ID;
    const commandText = data.COMMAND ?? "";
    if (!fromUserId || !commandText?.trim()) {
        log.debug("[Bitrix24] Command event missing details");
        return;
    }
    // Verify secret
    const { verified, account } = await verifySecret(secret, log);
    if (!verified)
        return;
    log.debug(`[Bitrix24] Incoming command from user ${fromUserId}: ${commandText}`);
    // Get channel config for processing
    const accountKey = `${meta.id}:${account.accountId || "default"}`;
    // Create command envelope for OpenClaw
    const envelope = {
        channel: "bitrix24",
        channelAccount: account.accountId || "default",
        fromChannelUser: fromUserId.toString(),
        fromName: `User${fromUserId}`,
        timestamp: new Date().toISOString(),
        text: commandText,
        raw: event,
    };
    // Deliver to OpenClaw via channel delivery
    try {
        await getBitrix24Runtime().channel.delivery.deliverInboundMessage({
            envelope,
            cfg: await getBitrix24Runtime().config.readConfigFile(),
            channelKey: accountKey,
        });
        log.info(`[Bitrix24] Delivered command from ${fromUserId} to OpenClaw`);
    }
    catch (error) {
        log.error(`[Bitrix24] Failed to deliver command to OpenClaw: ${String(error)}`);
    }
}
/**
 * Get webhook URL for Bitrix24 configuration
 */
export function getWebhookUrl() {
    return "/chan/bitrix24/webhook";
}
