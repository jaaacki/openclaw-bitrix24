/**
 * Bitrix24 Webhook Handler
 * Handles incoming webhook events from Bitrix24
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import fs from "node:fs";
import zlib from "node:zlib";
import { promisify } from "node:util";

const inflateAsync = promisify(zlib.inflate);

import { getBitrix24Runtime } from "./runtime.js";
import { resolveBitrix24Account } from "./accounts.js";
import type { Bitrix24Attachment } from "./types.js";

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
  try {
    // Resolve account configuration
    const cfg = await getBitrix24Runtime().config.loadConfig();
    // Currently only supporting default account for inbound webhooks
    // TODO: Support multi-account resolution via query param or domain check
    const account = resolveBitrix24Account({ cfg, accountId: "default" });

    if (!account.domain || !account.webhookSecret) {
      log?.error?.("[Bitrix24] Bitrix24 account not configured");
      return { verified: false };
    }

    // Strict check: Secret must be present and match
    if (!secret || secret !== account.webhookSecret) {
      log?.warn?.(`[Bitrix24] Webhook secret verification failed. Received: ${secret ? "***" : "empty"}`);
      return { verified: false, account };
    }

    return { verified: true, account };
  } catch (err) {
    log?.error?.(`[Bitrix24] verifySecret failed: ${String(err)}`);
    return { verified: false };
  }
}

/**
 * Promise timeout wrapper - prevents hangs by timing out long operations
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${errorMessage} (timeout after ${timeoutMs}ms)`));
    }, timeoutMs);
    
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Handle incoming message event (ONIMMESSAGEADD)
 */
async function handleIncomingMessage(
  event: Bitrix24WebhookEvent,
  secret: string | null,
  log: any,
): Promise<void> {
  // Top-level try-catch to ensure we never silently fail
  let fromUserId: string | undefined;
  let userName = "Unknown";
  
  try {
    const { data } = event;
    const runtime = getBitrix24Runtime();

    // Extract from PARAMS (bot messages) or direct data fields
    const params = data.PARAMS || {};
    const user = data.USER || {};

    // Extract message details
    fromUserId = params.FROM_USER_ID || params.AUTHOR_ID || data.AUTHOR_ID || data.FROM_USER_ID || user.ID;
    const toUserId = params.TO_USER_ID || data.TO_USER_ID;
    const toChatId = params.TO_CHAT_ID || data.CHAT_ID;
    const dialogId = params.DIALOG_ID || data.DIALOG_ID;
    const messageText = params.MESSAGE || data.MESSAGE || "";
    userName = user.NAME || `User${fromUserId}`;
    const messageId = params.MESSAGE_ID || data.MESSAGE_ID;
    const timestamp = event.ts ? parseInt(event.ts, 10) * 1000 : Date.now();
    const isGroup = params.CHAT_TYPE === "C" || params.CHAT_TYPE === "O"; // C=chat, O=open channel

    if (!fromUserId) {
      log?.warn?.("[Bitrix24] Message event missing author ID");
      return;
    }

  const filesCount = parseInt(params.FILES, 10) || 0;
  const potentialFileId = params.PARAMS ? parseInt(params.PARAMS, 10) : null;
  const hasAttachment = filesCount > 0 || (potentialFileId && potentialFileId > 690000); // File IDs are high numbers (>690000)
  
  if (!messageText?.trim() && !data.ATTACHMENTS?.length && !hasAttachment) {
    log?.debug?.("[Bitrix24] Empty message (no text, no attachments), skipping");
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

  // Parse attachments from the message
  let attachments: Bitrix24Attachment[] = [];
  let processedMessageText = messageText;
  
  // Create client for fetching file details
  const { Bitrix24Client } = await import("./client.js");
  const fileClient = new Bitrix24Client({
    domain: account.domain,
    webhookSecret: account.webhookSecret,
    userId: account.userId,
    botId: account.botId || eventBotId,
    clientId: account.clientId,
    log: log || console,
  });
  
  // Show typing indicator immediately so user knows bot is processing
  // Bot sends this before any heavy processing starts
  const dialogIdForTyping = fromUserId?.toString() || dialogId || "1";
  fileClient.sendTyping({ userId: dialogIdForTyping }).catch((err) => {
    log?.debug?.(`[Bitrix24] Typing indicator failed (non-critical): ${String(err)}`);
  });
  
  // Check for file attachments via FILES count and PARAMS file ID
  // When FILES > 0, PARAMS contains the disk file ID
  // Also check when FILES is 0 but PARAMS looks like a file ID (Bitrix24 inconsistency)
  const fileIdFromParams = params.PARAMS ? parseInt(params.PARAMS, 10) : null;
  const hasAttachmentIndicator = filesCount > 0 || (fileIdFromParams && !messageText?.trim());
  
  if (fileIdFromParams && hasAttachmentIndicator) {
    log?.info?.(`[Bitrix24] Message has attachment indicator (FILES=${filesCount}), fetching file ID ${fileIdFromParams}`);
    
    try {
      // Fetch file info using disk.file.get with the file ID from PARAMS
      const fileInfo = await fileClient.callApi("disk.file.get", { id: fileIdFromParams });
      
      if (fileInfo && fileInfo.ID) {
        const attachment: Bitrix24Attachment = {
          id: parseInt(fileInfo.ID, 10),
          name: fileInfo.NAME || `file_${fileInfo.ID}`,
          type: fileInfo.TYPE || "application/octet-stream",
          size: parseInt(fileInfo.SIZE, 10) || 0,
          category: categorizeAttachment(fileInfo.TYPE, fileInfo.NAME),
          url: fileInfo.DOWNLOAD_URL,
          fileId: parseInt(fileInfo.FILE_ID, 10),
        };
        attachments.push(attachment);
        log?.info?.(`[Bitrix24] Fetched attachment: ${attachment.name} (${attachment.category}, ${attachment.size} bytes)`);
      } else {
        log?.warn?.(`[Bitrix24] disk.file.get returned no data for ID ${fileIdFromParams}`);
      }
    } catch (err) {
      log?.error?.(`[Bitrix24] Failed to fetch file info for ID ${fileIdFromParams}: ${String(err)}`);
    }
  }
  
  // Also try legacy parsing for any additional attachments
  const legacyAttachments = parseAttachments(params, data);
  if (legacyAttachments.length > 0) {
    // Merge, avoiding duplicates by ID
    const existingIds = new Set(attachments.map(a => a.id));
    for (const att of legacyAttachments) {
      if (!existingIds.has(att.id)) {
        attachments.push(att);
      }
    }
  }
  
  // Debug logging for attachment parsing
  log?.debug?.(`[Bitrix24] Attachment debug: PARAMS.FILES="${params.FILES}", PARAMS="${params.PARAMS}", found ${attachments.length} attachment(s)`);
  if (attachments.length > 0) {
    attachments.forEach((att, i) => {
      log?.debug?.(`[Bitrix24] Attachment ${i + 1}: id=${att.id}, name=${att.name}, category=${att.category}`);
    });
  }
  
  // Get config early for agent routing and ASR configuration
  const cfg = await runtime.config.loadConfig();

  // Fetch detailed file info for any attachments that need it (missing URL, etc.)
  if (attachments.length > 0) {
    log?.info?.(`[Bitrix24] Processing ${attachments.length} attachment(s)`);

    // Enhanced file details for attachments that need more info
    const enhancedAttachments: Bitrix24Attachment[] = [];
    for (const att of attachments) {
      // If we already have a URL, keep as-is; otherwise try to fetch
      if (att.url) {
        enhancedAttachments.push(att);
      } else {
        const fileInfo = await fetchFileInfo(fileClient, att.id, log);
        if (fileInfo) {
          enhancedAttachments.push({ ...att, ...fileInfo });
        } else {
          enhancedAttachments.push(att);
        }
      }
    }
    attachments = enhancedAttachments;
    
    // Extract account and global config for ASR provider selection
    const accountConfig = account?.config ? {
      asrProvider: account.config.asrProvider,
      qwenAsrUrl: account.config.qwenAsrUrl,
    } : undefined;
    
    const globalConfig: { asrProvider?: string; qwenAsrUrl?: string } = {
      asrProvider: cfg.channels?.bitrix24?.asrProvider,
      qwenAsrUrl: cfg.channels?.bitrix24?.qwenAsrUrl,
    };
    
    // Process each attachment (download and analyze content)
    for (const att of attachments) {
      log?.info?.(`[Bitrix24] Processing ${att.category} attachment: ${att.name}`);
      const content = await downloadAndProcessAttachment(att, fileClient, accountConfig, globalConfig, log);
      if (content) {
        att.contentDescription = content;
        log?.info?.(`[Bitrix24] Analyzed: ${content.slice(0, 100)}...`);
        
        // For voice messages with transcription, also update message text
        if (att.category === "voice" && !processedMessageText) {
          processedMessageText = content;
        }
      }
    }
  }

  log?.info?.(
    `[Bitrix24] Message from ${userName} (${fromUserId}): ${processedMessageText?.slice(0, 100)}`,
  );

  // Build addresses for routing
  const peerId = isGroup && toChatId ? `chat:${toChatId}` : fromUserId.toString();
  const fromAddress = `bitrix24:${peerId}`;
  const toAddress = fromAddress;
  const conversationLabel = isGroup ? `chat:${toChatId}` : userName;

  // Resolve agent route (cfg already loaded earlier)
  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "bitrix24",
    accountId: account.accountId || "default",
    peer: {
      kind: isGroup ? "group" : "dm",
      id: peerId,
    },
  });

  // Format message body with attachments (include analysis in agent context)
  const fullMessageBody = processedMessageText + formatAttachmentsForContext(attachments);
  
  // Format the inbound envelope
  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "Bitrix24",
    from: conversationLabel,
    timestamp,
    body: fullMessageBody,
    chatType: isGroup ? "group" : "direct",
    sender: {
      id: fromUserId.toString(),
      name: userName,
    },
    previousTimestamp: null,
    envelope: envelopeOptions,
  });

  // Prepare attachment metadata for context
  const attachmentContext = attachments.map(att => ({
    id: att.id,
    name: att.name,
    type: att.type,
    category: att.category,
    size: att.size,
    url: att.url,
    duration: att.duration,
    transcription: att.transcription,
  }));

  // Build finalized context for the agent
  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: processedMessageText,
    CommandBody: processedMessageText,
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
    // Custom fields for attachments
    Attachments: [...(params.ATTACH ? [params.ATTACH].flat() : []), ...(data.ATTACHMENTS || [])],
    Bitrix24Attachments: attachmentContext,
  });

  // Reuse the existing Bitrix24 client for sending replies

  // Reply target (user who sent the message)
  const replyDialogId = fromUserId?.toString() || dialogId || "1";

  // Dispatch to agent and deliver response
  // Use timeout to prevent indefinite hangs (5 minutes max for agent processing)
  const DISPATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  
  try {
    log?.info?.(`[Bitrix24] Starting agent dispatch for message from ${userName} (${fromUserId})`);
    const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);

    await withTimeout(
      runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
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
              await fileClient.sendMessage({
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
      }),
      DISPATCH_TIMEOUT_MS,
      `Agent dispatch timed out for message from ${userName}`
    );

    log?.info?.(`[Bitrix24] Processed message from ${userName} (${fromUserId})`);
  } catch (error) {
    const errorMsg = String(error);
    const isTimeout = errorMsg.includes("timeout");
    log?.error?.(`[Bitrix24] Failed to process message: ${errorMsg}`);

    // Fallback: send error message with context
    const userMessage = isTimeout 
      ? `Sorry, processing your message took too long. Please try again or simplify your request.`
      : `Sorry, I encountered an error processing your message.`;
    
    try {
      await fileClient.sendMessage({
        userId: replyDialogId,
        text: userMessage,
      });
    } catch (sendErr) {
      log?.error?.(`[Bitrix24] Failed to send error message: ${String(sendErr)}`);
    }
  }
  } catch (outerError) {
    // Catch any unexpected errors in the entire message handling flow
    log?.error?.(`[Bitrix24] Unexpected error in handleIncomingMessage: ${String(outerError)}`);
    log?.error?.(`[Bitrix24] Stack: ${(outerError as Error).stack || 'no stack'}`);
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
  
  // Show typing indicator for commands too
  const commandDialogId = dialogId || fromUserId?.toString() || "1";
  client.sendTyping({ userId: commandDialogId }).catch((err) => {
    log?.debug?.(`[Bitrix24] Command typing indicator failed (non-critical): ${String(err)}`);
  });

  // Dispatch to agent and deliver response
  // Use timeout to prevent indefinite hangs (3 minutes max for command processing)
  const COMMAND_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
  
  try {
    log?.info?.(`[Bitrix24] Starting command dispatch for /${commandName} from ${userName}`);
    const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);

    await withTimeout(
      runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
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
      }),
      COMMAND_TIMEOUT_MS,
      `Command /${commandName} dispatch timed out`
    );

    log?.info?.(`[Bitrix24] Processed command /${commandName} from ${userName}`);
  } catch (error) {
    const errorMsg = String(error);
    const isTimeout = errorMsg.includes("timeout");
    log?.error?.(`[Bitrix24] Failed to process command: ${errorMsg}`);

    // Fallback: send error message with context
    const userMessage = isTimeout
      ? `Sorry, the /${commandName} command took too long to process. Please try again.`
      : `Sorry, I encountered an error processing the /${commandName} command.`;
    
    try {
      await client.sendMessage({
        userId: dialogId,
        text: userMessage,
      });
    } catch (sendErr) {
      log?.error?.(`[Bitrix24] Failed to send error message: ${String(sendErr)}`);
    }
  }
}

/**
 * Parse attachments from webhook event data
 * Bitrix24 sends attachments in the ATTACH property
 */
function parseAttachments(params: any, data?: any): Bitrix24Attachment[] {
  const attachments: Bitrix24Attachment[] = [];
  
  // Check for ATTACH field (Bitrix24 sends this with file IDs)
  if (params.ATTACH) {
    const attach = params.ATTACH;
    
    // ATTACH can be an array of file IDs or a single file ID
    const fileIds = Array.isArray(attach) ? attach : [attach];
    
    for (const fileId of fileIds) {
      // File ID could be directly the ID or an object with ID property
      const id = typeof fileId === 'number' ? fileId : 
                 typeof fileId === 'string' ? parseInt(fileId, 10) :
                 fileId?.ID || fileId?.FILE_ID;
                 
      if (id) {
        attachments.push({
          id,
          name: fileId?.NAME || `file_${id}`,
          type: fileId?.CONTENT_TYPE || "application/octet-stream",
          size: fileId?.SIZE || 0,
          category: categorizeAttachment(fileId?.CONTENT_TYPE, fileId?.NAME),
          url: fileId?.DOWNLOAD_URL || fileId?.URL,
        });
      }
    }
  }
  
  // Check for FILES as object (Bitrix24 webhooks send file data in data.FILES as object with file IDs as keys)
  const filesData = data?.FILES || params.FILES;
  if (filesData && typeof filesData === 'object' && !Array.isArray(filesData)) {
    // FILES is an object where keys are file IDs and values are file metadata
    for (const [fileId, file] of Object.entries(filesData)) {
      const fileData = file as any;
      if (fileData && (fileId || fileData.ID || fileData.FILE_ID)) {
        const id = parseInt(fileId, 10) || fileData.ID || fileData.FILE_ID;
        attachments.push({
          id,
          name: fileData.NAME || fileData.FILE_NAME || `file_${id}`,
          type: fileData.CONTENT_TYPE || fileData.TYPE || "application/octet-stream",
          size: fileData.SIZE || fileData.FILE_SIZE || 0,
          category: categorizeAttachment(fileData.CONTENT_TYPE || fileData.TYPE, fileData.NAME),
          url: fileData.DOWNLOAD_URL || fileData.URL,
          previewUrl: fileData.PREVIEW_URL,
          duration: fileData.DURATION,
        });
      }
    }
  }
  
  // Check for FILES array (some Bitrix24 versions send this)
  if (params.FILES && Array.isArray(params.FILES)) {
    for (const file of params.FILES) {
      if (file.ID || file.FILE_ID) {
        attachments.push({
          id: file.ID || file.FILE_ID,
          name: file.NAME || file.FILE_NAME || "unknown",
          type: file.CONTENT_TYPE || file.TYPE || "application/octet-stream",
          size: file.SIZE || file.FILE_SIZE || 0,
          category: categorizeAttachment(file.CONTENT_TYPE || file.TYPE, file.NAME),
          url: file.DOWNLOAD_URL || file.URL,
          previewUrl: file.PREVIEW_URL,
          duration: file.DURATION,
        });
      }
    }
  }
  
  // Check for voice message indicators in PARAMS
  const isVoiceMessage = params.PARAMS?.IS_VOICE_MESSAGE === "Y" || 
                         params.IS_VOICE === "Y" ||
                         params.PARAMS?.VOICE_DURATION ||
                         params.VOICE_DURATION;
  
  if (isVoiceMessage && attachments.length > 0) {
    // Mark the first attachment as voice (or find by audio type)
    const voiceFile = attachments.find(a => a.category === "voice") || attachments[0];
    if (voiceFile) {
      voiceFile.category = "voice";
      voiceFile.duration = params.PARAMS?.VOICE_DURATION || params.VOICE_DURATION || voiceFile.duration;
    }
  }
  
  return attachments;
}

/**
 * Categorize attachment by MIME type and filename
 */
function categorizeAttachment(mimeType?: string, fileName?: string): Bitrix24Attachment["category"] {
  if (!mimeType && !fileName) return "file";
  
  const type = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  
  // Images
  if (type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) {
    return "image";
  }
  
  // Video
  if (type.startsWith("video/") || /\.(mp4|avi|mov|mkv|webm)$/i.test(name)) {
    return "video";
  }
  
  // Audio/Voice - Check for voice patterns first
  const isVoicePattern = name.includes("voice") || 
                         name.includes("audio") ||
                         /^mobile_audio_.*\.mp3$/i.test(name) ||
                         name.includes("recording");
  
  if (isVoicePattern) {
    return "voice";
  }
  
  if (type.startsWith("audio/") || type === "application/ogg") {
    // Check if it's a voice message (ogg/opus often used for voice)
    if (type.includes("ogg") || name.endsWith(".oga")) {
      return "voice";
    }
    return "file";
  }
  
  // Specific voice message types
  if (/\.(opus|oga|spx)$/i.test(name)) {
    return "voice";
  }
  
  // Documents
  if (type.includes("pdf") || type.includes("word") || type.includes("excel") ||
      type.includes("powerpoint") || /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$/i.test(name)) {
    return "document";
  }
  
  return "file";
}

/**
 * Fetch file info from Bitrix24 disk API
 */
async function fetchFileInfo(
  client: any,
  fileId: number,
  log?: any
): Promise<Bitrix24Attachment | null> {
  try {
    const fileInfo = await client.callApi("disk.file.get", { id: fileId });
    
    if (!fileInfo) {
      log?.warn?.(`[Bitrix24] Failed to get file info for ID ${fileId}`);
      return null;
    }
    
    return {
      id: fileInfo.ID,
      name: fileInfo.NAME,
      type: fileInfo.TYPE,
      size: fileInfo.SIZE,
      category: categorizeAttachment(fileInfo.TYPE, fileInfo.NAME),
      url: fileInfo.DOWNLOAD_URL,
    };
  } catch (err) {
    log?.warn?.(`[Bitrix24] Error fetching file info: ${String(err)}`);
    return null;
  }
}

/**
 * Transcribe voice message (simple wrapper that downloads then transcribes)
 */
async function transcribeVoiceAttachment(
  attachment: Bitrix24Attachment,
  client: any,
  accountConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  globalConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  log?: any
): Promise<string | null> {
  try {
    // First, try to download the file
    const fileContent = await client.downloadFile(attachment.url);
    
    if (!fileContent) {
      log?.warn?.(`[Bitrix24] Failed to download voice file ${attachment.id}`);
      return null;
    }
    
    // Use the shared transcription function
    const result = await transcribeVoiceContent(attachment, fileContent, accountConfig, globalConfig, log);
    
    // Extract just the transcription text if present
    if (result && result.includes('Transcription:')) {
      const match = result.match(/Transcription: "(.+)"/);
      return match ? match[1] : result;
    }
    
    return result;
  } catch (err) {
    log?.error?.(`[Bitrix24] Voice transcription failed: ${String(err)}`);
    return `[Voice message - ${attachment.duration || '?'}s]`;
  }
}

/**
 * Format attachments for agent context
 */
function formatAttachmentsForContext(attachments: Bitrix24Attachment[]): string {
  if (!attachments.length) return "";
  
  const parts = ["\n\n**Attachments:**"];
  
  for (const att of attachments) {
    const emoji = getAttachmentEmoji(att.category);
    const sizeStr = formatFileSize(att.size);
    parts.push(`${emoji} **${att.name}** (${sizeStr}) - [${att.category}]`);
    if (att.url) {
      parts.push(`  URL: ${att.url}`);
    }
    if (att.transcription) {
      parts.push(`  Transcription: "${att.transcription}"`);
    }
    if (att.contentDescription) {
      parts.push(`  Content: ${att.contentDescription}`);
    }
    if (att.duration) {
      parts.push(`  Duration: ${att.duration}s`);
    }
  }
  
  return parts.join("\n");
}

/**
 * Get emoji for attachment category
 */
function getAttachmentEmoji(category: Bitrix24Attachment["category"]): string {
  switch (category) {
    case "image": return "🖼️";
    case "video": return "🎥";
    case "voice": return "🎤";
    case "document": return "📄";
    default: return "📎";
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Download file from Bitrix24 and process based on type
 * Downloads the file to a temp location and analyzes content
 */
async function downloadAndProcessAttachment(
  attachment: Bitrix24Attachment,
  client: any,
  accountConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  globalConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  log?: any
): Promise<string | null> {
  if (!attachment.url) {
    log?.warn?.(`[Bitrix24] No download URL for attachment ${attachment.id}`);
    return null;
  }

  try {
    log?.info?.(`[Bitrix24] Downloading ${attachment.name} (${attachment.size} bytes)`);
    
    // Use client's downloadFile method if available, otherwise fetch
    let fileBuffer: Buffer | null = null;
    
    if (client.downloadFile) {
      fileBuffer = await client.downloadFile(attachment.url);
    } else {
      fileBuffer = await downloadFileFromUrl(attachment.url, log);
    }
    
    if (!fileBuffer) {
      log?.warn?.(`[Bitrix24] Failed to download file ${attachment.id}`);
      return null;
    }

    log?.info?.(`[Bitrix24] Downloaded ${attachment.name} (${fileBuffer.length} bytes), analyzing...`);

    // Process based on category
    switch (attachment.category) {
      case "image":
        return await analyzeImageAttachment(attachment, fileBuffer, log);
      case "document":
        return await extractDocumentText(attachment, fileBuffer, log);
      case "voice":
        // Transcribe voice messages
        return await transcribeVoiceContent(attachment, fileBuffer, accountConfig, globalConfig, log);
      case "video":
        return await processVideoAttachment(attachment, fileBuffer, log);
      default:
        // For other files, just return basic info
        return `[File: ${attachment.name} - ${formatFileSize(attachment.size)}]`;
    }
  } catch (err) {
    log?.error?.(`[Bitrix24] Failed to process attachment: ${String(err)}`);
    return null;
  }
}

/**
 * Download file from URL using fetch
 */
async function downloadFileFromUrl(url: string, log?: any): Promise<Buffer | null> {
  try {
    log?.debug?.(`[Bitrix24] Starting download from: ${url.slice(0, 50)}...`);
    const response = await fetch(url);
    if (!response.ok) {
      log?.warn?.(`[Bitrix24] Download failed: ${response.status} ${response.statusText}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    log?.debug?.(`[Bitrix24] Downloaded ${buffer.length} bytes`);
    return buffer;
  } catch (err) {
    log?.error?.(`[Bitrix24] Download error: ${String(err)}`);
    return null;
  }
}

/**
 * Analyze image attachment using OpenClaw image analysis
 */
async function analyzeImageAttachment(
  attachment: Bitrix24Attachment,
  fileBuffer: Buffer,
  log?: any
): Promise<string | null> {
  try {
    // Ensure /tmp exists
    const tmpDir = "/tmp";
    try {
      await fs.promises.access(tmpDir);
    } catch {
      log?.error?.(`[Bitrix24] /tmp directory not accessible`);
      return `[Image: ${attachment.name} - ${formatFileSize(attachment.size)}]`;
    }
    
    // Save to temp file
    const tempPath = `/tmp/bitrix24_img_${attachment.id}_${Date.now()}.jpg`;
    await fs.promises.writeFile(tempPath, fileBuffer);
    log?.info?.(`[Bitrix24] Saved image to: ${tempPath}`);
    
    // Verify file was written
    const stats = await fs.promises.stat(tempPath);
    log?.info?.(`[Bitrix24] Image file size on disk: ${stats.size} bytes`);
    
    // Try to use OpenClaw's image analysis tool
    try {
      const runtime = getBitrix24Runtime();
      if (runtime?.tools?.image) {
        log?.info?.(`[Bitrix24] Calling image analysis tool...`);
        const result = await runtime.tools.image({
          image: tempPath,
          prompt: "Describe what you see in this image in detail."
        });
        
        if (result && typeof result === 'object' && 'text' in result) {
          const description = (result as any).text;
          // Clean up temp file asynchronously
          fs.promises.unlink(tempPath).catch(() => {});
          return description;
        }
      } else {
        log?.warn?.(`[Bitrix24] Image analysis tool not available on runtime`);
      }
    } catch (toolErr) {
      log?.warn?.(`[Bitrix24] Image analysis tool error: ${String(toolErr)}`);
    }
    
    // Fallback: return file info with note that visual analysis wasn't possible
    const description = `[Image: ${attachment.name} - ${formatFileSize(attachment.size)} saved to ${tempPath}]`;
    
    // Keep the file for manual inspection
    log?.info?.(`[Bitrix24] Image preserved at: ${tempPath}`);
    
    return description;
  } catch (err) {
    log?.error?.(`[Bitrix24] Image analysis failed: ${String(err)}`);
    return `[Image: ${attachment.name}]`;
  }
}

/**
 * Extract text from document attachment
 */
async function extractDocumentText(
  attachment: Bitrix24Attachment,
  fileBuffer: Buffer,
  log?: any
): Promise<string | null> {
  try {
    log?.info?.(`[Bitrix24] Processing document: ${attachment.name}`);
    
    const name = attachment.name.toLowerCase();
    
    // Text files - extract directly
    if (name.endsWith('.txt') || name.endsWith('.json') || name.endsWith('.md') || name.endsWith('.csv')) {
      const text = fileBuffer.toString('utf-8').slice(0, 5000); // Limit to 5KB
      log?.info?.(`[Bitrix24] Extracted ${text.length} chars from text file`);
      return `[Text Document: ${attachment.name}]\nContent preview:\n${text.slice(0, 500)}...`;
    }
    
    // PDF detection
    if (name.endsWith('.pdf')) {
      // Check if it's a text-based PDF by looking for text markers  
      const header = fileBuffer.slice(0, 100).toString('ascii');
      const isPDF = header.startsWith('%PDF');
      
      if (isPDF) {
        // First, try to extract text from PDF
        const text = await extractPDFText(fileBuffer, log);
        if (text && text.length > 50) {
          return `[PDF: ${attachment.name} - ${formatFileSize(attachment.size)}]\nExtracted text:\n${text.slice(0, 800)}...`;
        }
        
        // If no text found, might be a scanned/image PDF - extract and analyze images
        log?.info?.(`[Bitrix24] No text found in PDF, checking for embedded images...`);
        const imageData = await extractPDFImages(fileBuffer, log);
        if (imageData) {
          // Analyze the extracted image
          const imageDesc = await analyzeImageBuffer(imageData, attachment, log);
          return `[Scanned PDF: ${attachment.name} - ${formatFileSize(attachment.size)}]\n${imageDesc}`;
        }
      }
      return `[PDF Document: ${attachment.name} - ${formatFileSize(attachment.size)}]`;
    }
    
    // Office documents (DOCX, XLSX, PPTX are ZIP-based XML)
    if (name.endsWith('.docx') || name.endsWith('.xlsx') || name.endsWith('.pptx')) {
      return `[Office Document: ${attachment.name} - ${formatFileSize(attachment.size)} - DOCX/XLSX/PPTX format]`;
    }
    
    // Legacy Office docs
    if (name.endsWith('.doc') || name.endsWith('.xls') || name.endsWith('.ppt')) {
      return `[Legacy Office Document: ${attachment.name} - ${formatFileSize(attachment.size)}]`;
    }
    
    // Generic document
    return `[Document: ${attachment.name} - ${formatFileSize(attachment.size)}]`;
  } catch (err) {
    log?.error?.(`[Bitrix24] Document extraction failed: ${String(err)}`);
    return `[Document: ${attachment.name} - ${formatFileSize(attachment.size)}]`;
  }
}

/**
 * Extract images from PDF buffer (for scanned documents)
 */
async function extractPDFImages(fileBuffer: Buffer, log?: any): Promise<Buffer | null> {
  try {
    const content = fileBuffer.toString('binary');
    
    // Look for image XObjects with DCTDecode (JPEG) or FlateDecode
    const imageRefs = content.match(/\/(Im\w+|Image\w+)\s+(\d+)\s+0\s+R/g) || [];
    
    if (imageRefs.length > 0) {
      log?.info?.(`[Bitrix24] Found ${imageRefs.length} image references in PDF`);
    }
    
    // Find all stream blocks in the PDF
    const streamMatches = content.match(/stream\r?\n?([\s\S]*?)\r?\n?endstream/g) || [];
    log?.info?.(`[Bitrix24] Found ${streamMatches.length} streams in PDF`);
    
    // Try to find and decompress FlateDecode streams containing JPEG images
    for (const streamBlock of streamMatches) {
      // Check if this stream has DCTDecode (JPEG) in its context before the stream
      const streamIndex = content.indexOf(streamBlock);
      const beforeStream = content.slice(Math.max(0, streamIndex - 500), streamIndex);
      
      // Look for /Filter /DCTDecode or /Filter /FlateDecode
      const hasDCTDecode = beforeStream.includes('/DCTDecode');
      const hasFlateDecode = beforeStream.includes('/FlateDecode');
      const isImage = beforeStream.includes('/Subtype /Image') || beforeStream.includes('/Type /XObject');
      
      const streamData = streamBlock
        .replace(/^stream\r?\n?/, '')
        .replace(/\r?\n?endstream$/, '');
      
      let processedData = streamData;
      
      // Decompress if FlateDecode
      if (hasFlateDecode && isImage) {
        try {
          const compressed = Buffer.from(streamData, 'binary');
          const decompressed = zlib.inflateSync(compressed);
          processedData = decompressed.toString('binary');
          log?.info?.(`[Bitrix24] Decompressed FlateDecode stream: ${decompressed.length} bytes`);
        } catch (decompressErr) {
          // Decompression failed, try raw
          log?.debug?.(`[Bitrix24] Could not decompress stream: ${String(decompressErr)}`);
        }
      }
      
      // Check for JPEG markers in raw or decompressed data
      const jpegStart = processedData.indexOf('\xff\xd8');
      const jpegEnd = processedData.indexOf('\xff\xd9');
      
      if (jpegStart !== -1 && jpegEnd !== -1 && jpegEnd > jpegStart) {
        // Check for valid JPEG header
        const jpegData = processedData.slice(jpegStart, jpegEnd + 2);
        // Verify JPEG is reasonable size (>1KB to avoid false positives)
        if (jpegData.length > 1024) {
          log?.info?.(`[Bitrix24] Found JPEG image in PDF: ${jpegData.length} bytes`);
          return Buffer.from(jpegData, 'binary');
        }
      }
      
      // Also try raw streams that aren't compressed (for DCTDecode)
      if (hasDCTDecode && streamData.length > 1024) {
        // DCTDecode streams are typically raw JPEG data
        const buf = Buffer.from(streamData, 'binary');
        if (buf[0] === 0xff && buf[1] === 0xd8) {
          log?.info?.(`[Bitrix24] Found raw DCTDecode JPEG: ${buf.length} bytes`);
          return buf;
        }
      }
    }
    
    return null;
  } catch (err) {
    log?.warn?.(`[Bitrix24] PDF image extraction failed: ${String(err)}`);
    return null;
  }
}

/**
 * Analyze image buffer using image analysis
 */
async function analyzeImageBuffer(imageBuffer: Buffer, attachment: Bitrix24Attachment, log?: any): Promise<string> {
  try {
    // Save to temp file
    const tempPath = `/tmp/bitrix24_pdfimg_${attachment.id}_${Date.now()}.jpg`;
    await fs.promises.writeFile(tempPath, imageBuffer);
    
    log?.info?.(`[Bitrix24] Analyzing extracted PDF image: ${tempPath}`);
    
    // Reuse the image analysis function
    const description = await analyzeImageAttachment(
      { ...attachment, name: `pdf_extracted_${attachment.name}.jpg` },
      imageBuffer,
      log
    );
    
    // Clean up
    fs.promises.unlink(tempPath).catch(() => {});
    
    return description || `[Scanned page from PDF]`;
  } catch (err) {
    log?.error?.(`[Bitrix24] PDF image analysis failed: ${String(err)}`);
    return `[Scanned page from PDF]`;
  }
}

/**
 * Extract text from PDF buffer (improved implementation)
 */
async function extractPDFText(fileBuffer: Buffer, log?: any): Promise<string | null> {
  try {
    log?.info?.(`[Bitrix24] Starting PDF text extraction (${fileBuffer.length} bytes)`);
    
    // Method 1: Look for text objects (BT ... ET blocks)
    const content = fileBuffer.toString('binary');
    
    // Look for Tj and TJ operators which contain text
    let extracted = '';
    
    // Pattern 1: (text) Tj - text showing operator
    const tjMatches = content.match(/\(([^\)]+)\)\s*Tj/g) || [];
    for (const match of tjMatches.slice(0, 100)) {
      const text = match.replace(/\(([^\)]+)\)\s*Tj/, '$1')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')');
      if (text && text.length > 1 && !/^\d+$/.test(text)) {
        extracted += text + ' ';
      }
    }
    
    // Pattern 2: [ (text) (text) ] TJ - array text operator
    const tjArrayMatches = content.match(/\[([^\]]+)\]\s*TJ/g) || [];
    for (const match of tjArrayMatches.slice(0, 50)) {
      const inner = match.replace(/\[(.+)\]\s*TJ/, '$1');
      const strings = inner.match(/\([^\)]+\)/g) || [];
      for (const str of strings) {
        const text = str.slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .trim();
        if (text && text.length > 1 && !/^\d+$/.test(text)) {
          extracted += text;
        }
      }
      extracted += ' ';
    }
    
    // Pattern 3: Look for literal strings in streams <...>
    const hexMatches = content.match(/<([0-9A-Fa-f]{4,})>/g) || [];
    for (const match of hexMatches.slice(0, 30)) {
      try {
        const hex = match.slice(1, -1);
        if (hex.length % 2 === 0) {
          let str = '';
          for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (byte >= 32 && byte < 127) str += String.fromCharCode(byte);
          }
          if (str.length > 3 && /[a-zA-Z]{3,}/.test(str)) {
            extracted += str + ' ';
          }
        }
      } catch {}
    }
    
    // Clean up extracted text
    extracted = extracted
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    log?.info?.(`[Bitrix24] Extracted ${extracted.length} chars from PDF`);
    
    if (extracted.length > 50) {
      return extracted.slice(0, 2000); // Limit to 2000 chars
    }
    
    return null;
  } catch (err) {
    log?.warn?.(`[Bitrix24] PDF text extraction failed: ${String(err)}`);
    return null;
  }
}

/**
 * Process video attachment (extract metadata, transcript if available)
 */
async function processVideoAttachment(
  attachment: Bitrix24Attachment,
  fileBuffer: Buffer,
  log?: any
): Promise<string | null> {
  log?.info?.(`[Bitrix24] Video received: ${attachment.name}`);
  
  const duration = attachment.duration ? `${attachment.duration}s` : 'unknown duration';
  return `[Video: ${attachment.name} - ${formatFileSize(attachment.size)} - ${duration}]`;
}

/**
 * ASR Provider types
 */
type ASRProvider = "openai" | "qwen" | "auto";

/**
 * Get OpenAI API key from OpenClaw auth profiles
 */
async function getOpenAIKey(log?: any): Promise<string | null> {
  try {
    const homedir = process.env.HOME || process.env.USERPROFILE || '/Users/noonoon';
    const authPath = `${homedir}/.openclaw/agents/main/agent/auth-profiles.json`;
    
    const authData = await fs.promises.readFile(authPath, 'utf-8');
    const auth = JSON.parse(authData);
    
    const openaiProfile = auth.profiles?.['openai:default'];
    if (openaiProfile?.key) {
      return openaiProfile.key;
    }
    
    // Try env var as fallback
    return process.env.OPENAI_API_KEY || null;
  } catch (err) {
    log?.debug?.(`[Bitrix24] Could not read auth profiles: ${String(err)}`);
    return process.env.OPENAI_API_KEY || null;
  }
}

/**
 * Check if Qwen3-ASR service is reachable
 */
async function checkQwenReachable(qwenUrl?: string, log?: any): Promise<boolean> {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    // Extract base URL for health check (remove /v1/audio/transcriptions path)
    const baseUrl = (qwenUrl || "http://192.168.2.198:8100").replace(/\/v1\/.*$/, "");

    // Simple HTTP check with timeout
    const curlCmd = `curl -s -o /dev/null -w "%{http_code}" --max-time 3 ${baseUrl}/health 2>/dev/null || echo "000"`;

    const { stdout } = await execAsync(curlCmd, { timeout: 5000 });
    const statusCode = stdout.trim();

    const isReachable = statusCode === "200" || statusCode === "404"; // 404 is OK if health endpoint doesn't exist

    log?.debug?.(`[Bitrix24] Qwen3-ASR health check ${baseUrl}: HTTP ${statusCode}`);
    return isReachable;
  } catch (err) {
    log?.debug?.(`[Bitrix24] Qwen3-ASR reachability check failed: ${String(err)}`);
    return false;
  }
}

/**
 * Determine which ASR provider to use
 * Priority: 1) Per-account config 2) Global config 3) Environment variable 4) "auto" default
 * Supports: "openai" | "qwen" | "auto"
 * "auto": Try Qwen3 first, fallback to OpenAI if unavailable
 */
async function determineASRProvider(
  accountConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  globalConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  log?: any
): Promise<{ provider: ASRProvider; qwenUrl?: string }> {
  // Get Qwen URL from config or env
  const qwenUrl = accountConfig?.qwenAsrUrl 
    || globalConfig?.qwenAsrUrl 
    || process.env.QWEN_ASR_URL 
    || "http://192.168.2.198:8100/v1/audio/transcriptions";
  
  // Priority order: account config > global config > env var > "auto"
  const configured = (accountConfig?.asrProvider 
    || globalConfig?.asrProvider 
    || process.env.ASR_PROVIDER 
    || "auto").toLowerCase() as ASRProvider;
  
  if (configured === "openai") {
    log?.info?.(`[Bitrix24] ASR Provider: OpenAI (explicitly configured)`);
    return { provider: "openai", qwenUrl };
  }
  
  if (configured === "qwen") {
    log?.info?.(`[Bitrix24] ASR Provider: Qwen3-ASR (explicitly configured)`);
    return { provider: "qwen", qwenUrl };
  }
  
  // Auto mode: check Qwen3 availability
  log?.info?.(`[Bitrix24] ASR Provider: Auto mode - checking Qwen3-ASR availability...`);
  const qwenReachable = await checkQwenReachable(qwenUrl, log);
  
  if (qwenReachable) {
    log?.info?.(`[Bitrix24] ASR Provider: Auto selected Qwen3-ASR (service available)`);
    return { provider: "qwen", qwenUrl };
  }
  
  log?.info?.(`[Bitrix24] ASR Provider: Auto selected OpenAI (Qwen3 unavailable)`);
  return { provider: "openai", qwenUrl };
}

/**
 * Convert audio file to WAV format for better Qwen3-ASR compatibility
 * Qwen3-ASR works best with WAV/FLAC, but Bitrix24 sends MP3
 */
async function convertToWav(inputPath: string, log?: any): Promise<string | null> {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');

    // Convert to 16kHz mono WAV (optimal for ASR)
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -y "${outputPath}" 2>&1`;

    log?.debug?.(`[Bitrix24] Converting audio to WAV: ${inputPath} -> ${outputPath}`);

    const { stdout, stderr } = await execAsync(ffmpegCmd, { timeout: 30000 });

    // Check if output file was created
    try {
      await fs.promises.access(outputPath);
      log?.info?.(`[Bitrix24] Audio converted to WAV successfully`);
      return outputPath;
    } catch {
      log?.warn?.(`[Bitrix24] WAV conversion failed - file not created`);
      return null;
    }
  } catch (err) {
    log?.warn?.(`[Bitrix24] Audio conversion error: ${String(err)}`);
    return null;
  }
}

/**
 * Transcribe audio using Qwen3-ASR service
 * Automatically converts MP3 to WAV for better compatibility
 */
async function transcribeWithQwen(
  tempPath: string,
  attachment: Bitrix24Attachment,
  qwenUrl: string,
  log?: any
): Promise<{ success: boolean; text?: string; error?: string }> {
  let convertedPath: string | null = null;

  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    // Qwen3-ASR endpoint - uses local model, no API key needed
    const qwenEndpoint = qwenUrl || "http://192.168.2.198:8100/v1/audio/transcriptions";

    // Convert to WAV if not already WAV/FLAC (improves Qwen compatibility)
    let fileToSend = tempPath;
    const extension = tempPath.toLowerCase().match(/\.(mp3|m4a|aac|ogg)$/);

    if (extension) {
      log?.info?.(`[Bitrix24] Detected ${extension[1].toUpperCase()} format, converting to WAV...`);
      convertedPath = await convertToWav(tempPath, log);
      if (convertedPath) {
        fileToSend = convertedPath;
      } else {
        log?.warn?.(`[Bitrix24] Conversion failed, trying original file...`);
      }
    }

    const curlCmd = `curl -s -X POST "${qwenEndpoint}" \
      -H "Content-Type: multipart/form-data" \
      -F file="@${fileToSend}" \
      -F model="Qwen/Qwen3-ASR-0.6B" \
      -F response_format="json" \
      --max-time 60 2>&1`;

    log?.info?.(`[Bitrix24] Calling Qwen3-ASR at ${qwenEndpoint}...`);
    
    const { stdout } = await execAsync(curlCmd, { timeout: 65000 });
    
    if (stdout) {
      // Qwen3-ASR returns plain text (e.g., "hello world") not JSON
      const trimmed = stdout.trim();
      
      // Check if it's a quoted string (Qwen3-ASR format)
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
          const text = JSON.parse(trimmed); // Unquote the string
          log?.info?.(`[Bitrix24] Qwen3-ASR transcribed: ${text.slice(0, 50)}...`);
          return { success: true, text };
        } catch {
          // Not valid JSON string, use as-is
          const text = trimmed.slice(1, -1); // Remove outer quotes
          return { success: true, text };
        }
      }
      
      // Try parsing as JSON (for other ASR formats)
      try {
        const result = JSON.parse(stdout);
        if (result.text !== undefined && result.text !== null) {
          // Check if text is empty or whitespace only
          if (!result.text.trim()) {
            log?.warn?.(`[Bitrix24] Qwen3-ASR returned empty transcription`);
            return { success: false, error: "Empty transcription (no speech detected or unsupported format)" };
          }
          log?.info?.(`[Bitrix24] Qwen3-ASR transcribed: ${result.text.slice(0, 50)}...`);
          return { success: true, text: result.text };
        }
        if (result.error) {
          log?.warn?.(`[Bitrix24] Qwen3-ASR error: ${result.error.message || JSON.stringify(result.error)}`);
          return { success: false, error: result.error.message || "Qwen3-ASR API error" };
        }
        // Check for alternative response formats
        if (result.transcription) {
          return { success: true, text: result.transcription };
        }
        if (result.result) {
          return { success: true, text: result.result };
        }
      } catch {
        // Not JSON, check if it's plain text transcription or error
        if (trimmed.length > 0) {
          // Check for common error patterns
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerTrimmed.includes('internal server error') ||
              lowerTrimmed.includes('<!doctype') ||
              lowerTrimmed.includes('<html') ||
              lowerTrimmed.includes('error:') ||
              lowerTrimmed.includes('failed') ||
              lowerTrimmed.startsWith('curl:')) {
            log?.warn?.(`[Bitrix24] Qwen3-ASR error response: ${trimmed.slice(0, 100)}`);
            return { success: false, error: trimmed.slice(0, 200) };
          }
          // Valid transcription text
          log?.info?.(`[Bitrix24] Qwen3-ASR transcribed: ${trimmed.slice(0, 50)}...`);
          return { success: true, text: trimmed };
        }
      }
    }
    
    return { success: false, error: "No response data" };
  } catch (curlErr) {
    log?.error?.(`[Bitrix24] Qwen3-ASR curl error: ${String(curlErr)}`);
    return { success: false, error: "Network/connection error" };
  } finally {
    // Clean up converted WAV file
    if (convertedPath) {
      fs.promises.unlink(convertedPath).catch((err) => {
        log?.debug?.(`[Bitrix24] Failed to cleanup converted file ${convertedPath}: ${String(err)}`);
      });
    }
  }
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
async function transcribeWithOpenAI(
  tempPath: string,
  attachment: Bitrix24Attachment,
  apiKey: string,
  log?: any
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    
    const curlCmd = `curl -s https://api.openai.com/v1/audio/transcriptions \
      -H "Authorization: Bearer ${apiKey}" \
      -H "Content-Type: multipart/form-data" \
      -F file="@${tempPath}" \
      -F model="whisper-1" \
      -F response_format="json" 2>&1`;
    
    log?.info?.(`[Bitrix24] Calling OpenAI Whisper API...`);
    
    const { stdout } = await execAsync(curlCmd, { timeout: 60000 });
    
    if (stdout) {
      try {
        const result = JSON.parse(stdout);
        if (result.text) {
          log?.info?.(`[Bitrix24] OpenAI transcribed: ${result.text.slice(0, 50)}...`);
          return { success: true, text: result.text };
        }
        if (result.error) {
          log?.error?.(`[Bitrix24] OpenAI Whisper error: ${JSON.stringify(result.error)}`);
          return { success: false, error: result.error?.message || "OpenAI API error" };
        }
      } catch (parseErr) {
        log?.error?.(`[Bitrix24] OpenAI parse error: ${stdout.slice(0, 200)}`);
        return { success: false, error: "Invalid response format" };
      }
    }
    
    return { success: false, error: "No response data" };
  } catch (curlErr) {
    log?.error?.(`[Bitrix24] OpenAI curl error: ${String(curlErr)}`);
    return { success: false, error: "Network/connection error" };
  }
}

/**
 * Transcribe voice/audio content using configurable ASR providers
 * Supports both OpenAI Whisper and Qwen3-ASR with automatic fallback
 */
async function transcribeVoiceContent(
  attachment: Bitrix24Attachment,
  fileBuffer: Buffer,
  accountConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  globalConfig?: { asrProvider?: string; qwenAsrUrl?: string },
  log?: any
): Promise<string | null> {
  let tempPath: string | null = null;
  const usedProviders: string[] = [];

  try {
    log?.info?.(`[Bitrix24] Processing voice: ${attachment.name} (${fileBuffer.length} bytes)`);

    // Validate input
    if (!fileBuffer || fileBuffer.length === 0) {
      log?.warn?.(`[Bitrix24] Empty voice file buffer for ${attachment.name}`);
      return `[Voice Message: ${attachment.name} - Empty file]`;
    }

    if (fileBuffer.length > 25 * 1024 * 1024) { // OpenAI 25MB limit
      log?.warn?.(`[Bitrix24] Voice file too large: ${fileBuffer.length} bytes`);
      return `[Voice Message: ${attachment.name} - File too large for transcription]`;
    }

    // Determine which ASR provider to use
    const { provider, qwenUrl } = await determineASRProvider(accountConfig, globalConfig, log);

    // Save to temp file once
    tempPath = `/tmp/bitrix24_voice_${attachment.id}_${Date.now()}.mp3`;
    await fs.promises.writeFile(tempPath, fileBuffer);
    log?.info?.(`[Bitrix24] Saved voice file: ${tempPath}`);

    let result: { success: boolean; text?: string; error?: string } | null = null;

    // Primary provider based on selection
    if (provider === "qwen") {
      usedProviders.push("Qwen3-ASR");
      result = await transcribeWithQwen(tempPath, attachment, qwenUrl, log);

      // Fallback to OpenAI if Qwen fails
      if (!result.success) {
        log?.warn?.(`[Bitrix24] Qwen3-ASR failed: ${result.error}, falling back to OpenAI...`);
        const apiKey = await getOpenAIKey(log);
        if (apiKey) {
          usedProviders.push("OpenAI (fallback)");
          result = await transcribeWithOpenAI(tempPath, attachment, apiKey, log);
        } else {
          usedProviders.push("OpenAI (no key)");
          log?.warn?.(`[Bitrix24] Cannot fallback to OpenAI - no API key available`);
        }
      }
    } else if (provider === "openai") {
      const apiKey = await getOpenAIKey(log);
      if (!apiKey) {
        log?.warn?.(`[Bitrix24] OpenAI API key not found, trying Qwen3 fallback...`);
        usedProviders.push("OpenAI (no key)");
        result = await transcribeWithQwen(tempPath, attachment, qwenUrl, log);
      } else {
        usedProviders.push("OpenAI");
        result = await transcribeWithOpenAI(tempPath, attachment, apiKey, log);

        // Fallback to Qwen if OpenAI fails
        if (!result.success) {
          log?.warn?.(`[Bitrix24] OpenAI Whisper failed: ${result.error}, falling back to Qwen3...`);
          usedProviders.push("Qwen3-ASR (fallback)");
          result = await transcribeWithQwen(tempPath, attachment, qwenUrl, log);
        }
      }
    }

    // Format result
    if (result?.success && result.text) {
      const providerLabel = usedProviders.join(" → ");
      log?.info?.(`[Bitrix24] Transcription successful using: ${providerLabel}`);
      return `[Voice: ${attachment.name} - ${attachment.duration || '?'}s]\n📝 Transcription: "${result.text}"\n🔧 Provider: ${providerLabel}]`;
    }

    const errorMsg = result?.error || "Unknown error";
    log?.error?.(`[Bitrix24] All ASR providers failed. Attempted: ${usedProviders.join(", ")}`);
    return `[Voice Message: ${attachment.name} - ${attachment.duration || '?'}s - Transcription failed: ${errorMsg}\n🔧 Attempted: ${usedProviders.join(", ")}]`;

  } catch (err) {
    log?.error?.(`[Bitrix24] Voice transcription error: ${String(err)}`);
    return `[Voice Message: ${attachment.name} - ${attachment.duration || '?'}s]`;
  } finally {
    // ALWAYS clean up temp file (CRITICAL: prevents memory leak)
    if (tempPath) {
      fs.promises.unlink(tempPath).catch((unlinkErr) => {
        log?.debug?.(`[Bitrix24] Failed to cleanup temp file ${tempPath}: ${String(unlinkErr)}`);
      });
    }
  }
}

/**
 * Get webhook URL for Bitrix24 configuration
 */
export function getWebhookUrl(): string {
  return "/chan/bitrix24/webhook";
}
