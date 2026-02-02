/**
 * Bitrix24 Webhook Handler
 * Handles incoming webhook events from Bitrix24
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { getBitrix24Runtime } from "./runtime.js";
import { resolveBitrix24Account } from "./accounts.js";

/**
 * Bitrix24 webhook event types
 */
interface Bitrix24WebhookEvent {
  event: string;
  data: {
    MESSAGE_ID?: number;
    USER_ID?: number;
    AUTHOR_ID?: number;
    CHAT_ID?: number;
    FROM_USER_ID?: number;
    TO_USER_ID?: number;
    MESSAGE?: string;
    ATTACHMENTS?: any[];
    COMMAND?: string;
    COMMAND_USER_ID?: number;
    [key: string]: any;
  };
  ts?: string;
  auth?: {
    domain?: string;
    member_id?: string;
    application_token?: string;
    [key: string]: any;
  };
}

let pluginApi: OpenClawPluginApi | null = null;

/**
 * Register webhook route for Bitrix24
 */
export function registerBitrix24Webhook(api: OpenClawPluginApi): void {
  pluginApi = api;
  api.registerHttpRoute({
    path: "/chan/bitrix24/webhook",
    handler: handleBitrix24Webhook,
  });
}

/**
 * Parse body from IncomingMessage (handles both JSON and form-urlencoded)
 */
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        if (!body) {
          resolve({});
          return;
        }

        // Try JSON first
        if (body.startsWith("{")) {
          resolve(JSON.parse(body));
          return;
        }

        // Parse as form-urlencoded (Bitrix24 format)
        const params = new URLSearchParams(body);
        const result: any = { event: "", data: { PARAMS: {}, USER: {}, BOT: {} }, auth: {} };

        for (const [key, value] of params.entries()) {
          // Handle deeply nested keys like data[PARAMS][MESSAGE]
          if (key.startsWith("data[PARAMS]")) {
            const fieldMatch = key.match(/data\[PARAMS\]\[(\w+)\]/);
            if (fieldMatch) {
              result.data.PARAMS[fieldMatch[1]] = value;
            }
          } else if (key.startsWith("data[USER]")) {
            const fieldMatch = key.match(/data\[USER\]\[(\w+)\]/);
            if (fieldMatch) {
              result.data.USER[fieldMatch[1]] = value;
            }
          } else if (key.startsWith("data[BOT]")) {
            // data[BOT][130387][BOT_ID] format
            const fieldMatch = key.match(/data\[BOT\]\[\d+\]\[(\w+)\]/);
            if (fieldMatch) {
              result.data.BOT[fieldMatch[1]] = value;
            }
          } else if (key.startsWith("data[COMMAND]")) {
            // data[COMMAND][0][COMMAND] format for command events
            if (!result.data.COMMAND) result.data.COMMAND = {};
            const fieldMatch = key.match(/data\[COMMAND\]\[\d+\]\[(\w+)\]/);
            if (fieldMatch) {
              result.data.COMMAND[fieldMatch[1]] = value;
            }
          } else if (key.startsWith("auth[")) {
            const fieldMatch = key.match(/auth\[(\w+)\]/);
            if (fieldMatch) {
              result.auth[fieldMatch[1]] = value;
            }
          } else {
            result[key] = value;
          }
        }

        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Main webhook handler for Bitrix24 events
 */
async function handleBitrix24Webhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const log = pluginApi?.logger;

  try {
    // Parse secret from URL query params
    const url = new URL(req.url || "", "http://localhost");
    const secret = url.searchParams.get("secret");

    // Parse request body
    const event: Bitrix24WebhookEvent = await parseBody(req);
    log?.info?.(`[Bitrix24] Received webhook event: ${event.event}`);
    log?.info?.(`[Bitrix24] Raw parsed body: ${JSON.stringify(event)}`);

    // Verify event structure
    if (!event.event || !event.data) {
      log?.warn?.("[Bitrix24] Invalid webhook payload: missing event or data");
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid payload" }));
      return;
    }

    // Handle different event types
    switch (event.event) {
      case "ONIMMESSAGEADD":
      case "ONIMBOTMESSAGEADD":
        await handleIncomingMessage(event, secret, log);
        break;

      case "ONIMCOMMANDADD":
        await handleIncomingCommand(event, secret, log);
        break;

      default:
        log?.info?.(`[Bitrix24] Unhandled event type: ${event.event}`);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    log?.error?.(`[Bitrix24] Webhook processing error: ${String(error)}`);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}

/**
 * Verify webhook secret against account config
 */
async function verifySecret(secret: string | null, log: any): Promise<{ verified: boolean, account?: any }> {
  // Resolve account configuration
  const cfg = await getBitrix24Runtime().config.loadConfig();
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
async function handleIncomingMessage(
  event: Bitrix24WebhookEvent,
  secret: string | null,
  log: any,
): Promise<void> {
  const { data } = event;
  const runtime = getBitrix24Runtime();

  // Extract from PARAMS (bot messages) or direct data fields
  const params = data.PARAMS || {};
  const user = data.USER || {};

  // Extract message details
  const fromUserId = params.FROM_USER_ID || params.AUTHOR_ID || data.AUTHOR_ID || data.FROM_USER_ID || user.ID;
  const toUserId = params.TO_USER_ID || data.TO_USER_ID;
  const toChatId = params.TO_CHAT_ID || data.CHAT_ID;
  const dialogId = params.DIALOG_ID || data.DIALOG_ID;
  const messageText = params.MESSAGE || data.MESSAGE || "";
  const userName = user.NAME || `User${fromUserId}`;
  const messageId = params.MESSAGE_ID || data.MESSAGE_ID;
  const timestamp = event.ts ? parseInt(event.ts, 10) * 1000 : Date.now();
  const isGroup = params.CHAT_TYPE === "C" || params.CHAT_TYPE === "O"; // C=chat, O=open channel

  if (!fromUserId) {
    log?.warn?.("[Bitrix24] Message event missing author ID");
    return;
  }

  if (!messageText?.trim() && !data.ATTACHMENTS?.length) {
    log?.debug?.("[Bitrix24] Empty message, skipping");
    return;
  }

  // Skip bot's own messages to avoid infinite loop
  const botData = data.BOT || {};
  const eventBotId = botData.BOT_ID;
  if (fromUserId.toString() === eventBotId?.toString()) {
    log?.debug?.("[Bitrix24] Skipping bot's own message");
    return;
  }

  // Verify secret
  const { verified, account } = await verifySecret(secret, log);
  if (!verified) return;

  log?.info?.(
    `[Bitrix24] Message from ${userName} (${fromUserId}): ${messageText?.slice(0, 100)}`,
  );

  // Build addresses for routing
  const peerId = isGroup && toChatId ? `chat:${toChatId}` : fromUserId.toString();
  const fromAddress = `bitrix24:${peerId}`;
  const toAddress = fromAddress;
  const conversationLabel = isGroup ? `chat:${toChatId}` : userName;

  // Get config and resolve agent route
  const cfg = await runtime.config.loadConfig();
  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "bitrix24",
    accountId: account.accountId || "default",
    peer: {
      kind: isGroup ? "group" : "dm",
      id: peerId,
    },
  });

  // Format the inbound envelope
  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "Bitrix24",
    from: conversationLabel,
    timestamp,
    body: messageText,
    chatType: isGroup ? "group" : "direct",
    sender: {
      id: fromUserId.toString(),
      name: userName,
    },
    previousTimestamp: null,
    envelope: envelopeOptions,
  });

  // Build finalized context for the agent
  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: messageText,
    CommandBody: messageText,
    From: fromAddress,
    To: toAddress,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: conversationLabel,
    GroupSubject: isGroup ? `chat${toChatId}` : undefined,
    SenderId: fromUserId.toString(),
    SenderName: userName,
    Provider: "bitrix24",
    Surface: "bitrix24",
    MessageSid: messageId?.toString() || `msg:${timestamp}`,
    Timestamp: timestamp,
    OriginatingChannel: "bitrix24",
    OriginatingTo: toAddress,
  });

  // Create Bitrix24 client for sending replies
  const { Bitrix24Client } = await import("./client.js");
  const client = new Bitrix24Client({
    domain: account.domain,
    webhookSecret: account.webhookSecret,
    userId: account.userId,
    botId: account.botId || eventBotId,
    clientId: account.clientId,
    log: log || console,
  });

  // Reply target (user who sent the message)
  const replyDialogId = fromUserId?.toString() || dialogId || "1";

  // Dispatch to agent and deliver response
  try {
    const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);

    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        responsePrefix: messagesConfig.responsePrefix,
        deliver: async (payload: any, _info: any) => {
          log?.info?.(`[Bitrix24] Deliver callback invoked, payload keys: ${Object.keys(payload || {}).join(", ")}`);
          log?.debug?.(`[Bitrix24] Full payload: ${JSON.stringify(payload)}`);

          // Extract text from payload
          const text = payload.text || payload.body || payload.content || "";
          if (!text?.trim()) {
            log?.warn?.(`[Bitrix24] Empty text in payload, skipping delivery`);
            return;
          }

          log?.info?.(`[Bitrix24] Sending response to ${replyDialogId}: ${text.slice(0, 100)}...`);

          // Send via Bitrix24
          try {
            await client.sendMessage({
              userId: replyDialogId,
              text,
            });
            log?.info?.(`[Bitrix24] Delivered agent response to ${replyDialogId}`);
          } catch (sendErr) {
            log?.error?.(`[Bitrix24] Failed to send message in deliver callback: ${String(sendErr)}`);
            throw sendErr;
          }
        },
      },
    });

    log?.info?.(`[Bitrix24] Processed message from ${userName} (${fromUserId})`);
  } catch (error) {
    log?.error?.(`[Bitrix24] Failed to process message: ${String(error)}`);

    // Fallback: send error message
    try {
      await client.sendMessage({
        userId: replyDialogId,
        text: `Sorry, I encountered an error processing your message.`,
      });
    } catch (sendErr) {
      log?.error?.(`[Bitrix24] Failed to send error message: ${String(sendErr)}`);
    }
  }
}

/**
 * Handle incoming command event (ONIMCOMMANDADD)
 *
 * Event structure:
 * - COMMAND: { BOT_ID, BOT_CODE, COMMAND, COMMAND_ID, COMMAND_PARAMS, COMMAND_CONTEXT }
 * - PARAMS: { DIALOG_ID, CHAT_TYPE, MESSAGE, FROM_USER_ID, TO_USER_ID, MESSAGE_ID }
 * - USER: { ID, NAME, FIRST_NAME, LAST_NAME }
 */
async function handleIncomingCommand(
  event: Bitrix24WebhookEvent,
  secret: string | null,
  log: any,
): Promise<void> {
  const { data } = event;
  const runtime = getBitrix24Runtime();

  // Extract from COMMAND, PARAMS, and USER structures
  const command = data.COMMAND || {};
  const params = data.PARAMS || {};
  const user = data.USER || {};

  // Command details
  const commandName = command.COMMAND || data.COMMAND;
  const commandId = command.COMMAND_ID;
  const commandParams = command.COMMAND_PARAMS || "";
  const commandContext = command.COMMAND_CONTEXT || "TEXTAREA"; // TEXTAREA or KEYBOARD
  const botId = command.BOT_ID || data.BOT?.BOT_ID;

  // Message details
  const fromUserId = params.FROM_USER_ID || user.ID || data.AUTHOR_ID;
  const messageId = params.MESSAGE_ID || data.MESSAGE_ID;
  const dialogId = params.DIALOG_ID || fromUserId?.toString();
  const chatType = params.CHAT_TYPE || "P"; // P=private, C=chat, O=open
  const isGroup = chatType === "C" || chatType === "O";

  // User details
  const userName = user.NAME || `${user.FIRST_NAME || ""} ${user.LAST_NAME || ""}`.trim() || `User${fromUserId}`;
  const timestamp = event.ts ? parseInt(event.ts, 10) * 1000 : Date.now();

  if (!fromUserId || !commandName) {
    log?.debug?.("[Bitrix24] Command event missing required details");
    return;
  }

  // Verify secret
  const { verified, account } = await verifySecret(secret, log);
  if (!verified) return;

  log?.info?.(`[Bitrix24] Command /${commandName} from ${userName} (${fromUserId}), params: "${commandParams}"`);

  // Build full command text (like "/help query")
  const fullCommandText = commandParams
    ? `/${commandName} ${commandParams}`
    : `/${commandName}`;

  // Build addresses for routing
  const peerId = isGroup ? `chat:${dialogId}` : fromUserId.toString();
  const fromAddress = `bitrix24:${peerId}`;
  const toAddress = `slash:${fromUserId}`;
  const conversationLabel = isGroup ? `chat:${dialogId}` : userName;

  // Get config and resolve agent route
  const cfg = await runtime.config.loadConfig();
  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "bitrix24",
    accountId: account.accountId || "default",
    peer: {
      kind: isGroup ? "group" : "dm",
      id: peerId,
    },
  });

  // Parse command arguments (simple space-separated for now)
  const commandArgs = commandParams ? { raw: commandParams } : undefined;

  // Build finalized context for the agent (following Telegram pattern)
  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: fullCommandText,
    RawBody: fullCommandText,
    CommandBody: fullCommandText,
    CommandArgs: commandArgs,
    CommandSource: "native",
    CommandAuthorized: true, // TODO: check allowFrom
    From: fromAddress,
    To: toAddress,
    SessionKey: `bitrix24:slash:${fromUserId}`,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: conversationLabel,
    GroupSubject: isGroup ? dialogId : undefined,
    SenderId: fromUserId.toString(),
    SenderName: userName,
    Provider: "bitrix24",
    Surface: "bitrix24",
    MessageSid: messageId?.toString() || `cmd:${timestamp}`,
    Timestamp: timestamp,
    WasMentioned: true,
    OriginatingChannel: "bitrix24",
    OriginatingTo: toAddress,
  });

  // Create Bitrix24 client for sending replies
  const { Bitrix24Client } = await import("./client.js");
  const client = new Bitrix24Client({
    domain: account.domain,
    webhookSecret: account.webhookSecret,
    userId: account.userId,
    botId: account.botId || botId,
    clientId: account.clientId,
    log: log || console,
  });

  // Dispatch to agent and deliver response
  try {
    const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);

    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        responsePrefix: messagesConfig.responsePrefix,
        deliver: async (payload: any, _info: any) => {
          const text = payload.text || payload.body || payload.content || "";
          if (!text?.trim()) {
            log?.warn?.("[Bitrix24] Empty command response, skipping");
            return;
          }

          log?.info?.(`[Bitrix24] Sending command response to ${dialogId}: ${text.slice(0, 100)}...`);

          try {
            // Use answerCommand if we have messageId and commandId, otherwise sendMessage
            if (messageId && (commandId || commandName)) {
              await client.answerCommand({
                commandId: commandId ? parseInt(commandId, 10) : undefined,
                command: commandId ? undefined : commandName,
                messageId: parseInt(messageId, 10),
                message: text,
              });
            } else {
              await client.sendMessage({
                userId: dialogId,
                text,
              });
            }
            log?.info?.(`[Bitrix24] Delivered command response`);
          } catch (sendErr) {
            log?.error?.(`[Bitrix24] Failed to send command response: ${String(sendErr)}`);
            throw sendErr;
          }
        },
      },
    });

    log?.info?.(`[Bitrix24] Processed command /${commandName} from ${userName}`);
  } catch (error) {
    log?.error?.(`[Bitrix24] Failed to process command: ${String(error)}`);

    // Fallback: send error message
    try {
      await client.sendMessage({
        userId: dialogId,
        text: `Sorry, I encountered an error processing the /${commandName} command.`,
      });
    } catch (sendErr) {
      log?.error?.(`[Bitrix24] Failed to send error message: ${String(sendErr)}`);
    }
  }
}

/**
 * Get webhook URL for Bitrix24 configuration
 */
export function getWebhookUrl(): string {
  return "/chan/bitrix24/webhook";
}
