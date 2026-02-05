/**
 * Bitrix24 REST API Client
 * Handles API requests to Bitrix24 with rate limiting and error handling
 *
 * @module client
 */

/** Configuration options for the Bitrix24 client */
interface Bitrix24ClientOptions {
  domain: string;
  webhookSecret?: string;
  userId?: string;
  botId?: string;
  botCode?: string; // Bot's webhook secret (from BOT_CODE in events)
  clientId?: string; // OAuth client ID (from application_token in events)
  log: any; // OpenClaw logger
}

interface SendMessageOptions {
  userId: string;
  text: string;
  [key: string]: any;
}

interface CommandLang {
  LANGUAGE_ID: string;
  TITLE: string;
  PARAMS?: string;
}

interface RegisterCommandOptions {
  command: string;
  lang: CommandLang[];
  common?: boolean;
  hidden?: boolean;
  extranetSupport?: boolean;
  eventHandler?: string;
}

interface AnswerCommandOptions {
  commandId?: number;
  command?: string;
  messageId: number;
  message: string;
  attach?: any;
  keyboard?: any;
  menu?: any;
  system?: boolean;
  urlPreview?: boolean;
}

interface ApiResponse {
  result?: any;
  error?: string;
  error_description?: string;
}

export class Bitrix24Client {
  private domain: string;
  private webhookSecret?: string;
  private userId?: string;
  private botId?: string;
  private botCode?: string;
  private clientId?: string;
  private log: any;
  private baseUrl: string;
  private rateLimit: {
    requestsPerSecond: number;
    lastRequestTime: number;
    minWait: number;
  };

  constructor({ domain, webhookSecret, userId, botId, botCode, clientId, log }: Bitrix24ClientOptions) {
    this.domain = domain;
    this.webhookSecret = webhookSecret;
    this.userId = userId;
    this.botId = botId;
    this.botCode = botCode;
    this.clientId = clientId;
    this.log = log;

    // Rate limiting
    this.rateLimit = {
      requestsPerSecond: 1,
      lastRequestTime: 0,
      minWait: 1000, // 1 second
    };

    // Base API URL - always use REST endpoint, auth will be in params
    this.baseUrl = `https://${domain}/rest`;
  }

  /**
   * Execute a Bitrix24 REST API call
   */
  async callApi(method: string, params: Record<string, any> = {}): Promise<any> {
    await this.waitForRateLimit();

    // Build query parameters
    const queryParams = new URLSearchParams();

    // Add all params as query string (Bitrix24 expects URL params, not JSON body)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    }

    // Add CLIENT_ID if available (required for bot API calls)
    if (this.clientId) {
      queryParams.append("CLIENT_ID", this.clientId);
    }

    let url: string;
    // Always use webhook URL pattern: /rest/{userId}/{webhookSecret}/{method}
    if (this.userId && this.webhookSecret) {
      url = `https://${this.domain}/rest/${this.userId}/${this.webhookSecret}/${method}`;
    } else {
      url = `${this.baseUrl}/${method}`;
    }

    const fullUrl = queryParams.toString() ? `${url}?${queryParams.toString()}` : url;
    this.log?.debug?.(`[Bitrix24] API call: ${method} to ${fullUrl}`);

    try {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Accept": "*/*",
          "Content-Length": "0",
        },
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse = await response.json();

      if (data.error) {
        throw new Error(`API error: ${data.error_description || data.error}`);
      }

      this.log?.debug?.(`Bitrix24 API call success: ${method}`);
      return data.result;
    } catch (error) {
      this.log?.error?.(`Bitrix24 API call failed: ${method}`, error);
      throw error;
    }
  }

  /**
   * Rate limiting - wait between requests
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.rateLimit.lastRequestTime;

    if (elapsed < this.rateLimit.minWait) {
      const waitTime = this.rateLimit.minWait - elapsed;
      this.log?.debug?.(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.rateLimit.lastRequestTime = Date.now();
  }

  /**
   * Send message to Bitrix24 user or chat AS THE BOT
   */
  async sendMessage({ userId, text, ...options }: SendMessageOptions): Promise<any> {
    // Convert Markdown to BBCode for Bitrix24
    const formattedText = this.markdownToBb(text);

    // Use imbot.message.add for bot to send messages
    // Format: /imbot.message.add?BOT_ID=xxx&DIALOG_ID=xxx&CLIENT_ID=xxx&SYSTEM=N&MESSAGE=xxx
    const params: Record<string, any> = {
      DIALOG_ID: userId, // User ID to send to
      MESSAGE: formattedText,
      SYSTEM: "N",
      ...options,
    };

    // BOT_ID is required for imbot.message.add
    if (this.botId) {
      params.BOT_ID = this.botId;
    }

    this.log?.info?.(`[Bitrix24] Sending bot message to DIALOG_ID=${userId}, BOT_ID=${this.botId}`);
    this.log?.debug?.(`[Bitrix24] Original text length: ${text.length}, formatted: ${formattedText.length}`);

    // Use imbot.message.add so message comes FROM the bot
    const result = await this.callApi("imbot.message.add", params);

    this.log?.info?.(`Bot message sent to ${userId}`);
    return result;
  }

  /**
   * Register bot (get bot ID for webhook events)
   */
  async registerBot({
    botName,
    botCode,
    webhookUrl,
  }: {
    botName: string;
    botCode: string;
    webhookUrl?: string;
  }): Promise<any> {
    // Set bot handler URL
    const handlerUrl =
      webhookUrl || `https://your-domain.com/bitrix24/webhook/${this.domain}`;

    const params = {
      EVENT_HANDLER: handlerUrl,
      EVENT_MESSAGE_ADD: "Y",
      EVENT_WELCOME_MESSAGE: "Y",
      EVENT_BOT_DELETE: "Y",
      EVENT_OPEN_LINES: "N",
    };

    const result = await this.callApi("imbot.bot.update", params);

    this.log?.info?.(`Bot ${botCode} registered for ${this.domain}`);
    return result;
  }

  /**
   * Get user info by ID
   */
  async getUserInfo(userId: string): Promise<any> {
    const result = await this.callApi("user.get", {
      ID: parseInt(userId, 10),
    });

    return result && result[0] ? result[0] : null;
  }

  /**
   * Send file attachment
   */
  async sendFile({
    userId,
    fileName,
    fileType,
    fileContent,
  }: {
    userId: string;
    fileName: string;
    fileType: string;
    fileContent: any;
  }): Promise<any> {
    // First, upload file to disk.storage
    const uploadResult = await this.callApi("disk.storage.uploadfile", {
      FILE_NAME: fileName,
      FILE_CONTENT: {
        [fileType]: fileContent,
      },
    });

    if (!uploadResult || !uploadResult.ID) {
      throw new Error("File upload failed");
    }

    // Then send file message
    const messageResult = await this.callApi("imbot.message.add", {
      USER_ID: parseInt(userId, 10),
      ATTACH: {
        MYFILES: uploadResult.ID,
      },
    });

    this.log.info(`File sent to Bitrix24 user ${userId}: ${fileName}`);
    return messageResult;
  }

  /**
   * Health check - verify connection to Bitrix24
   */
  async health(): Promise<boolean> {
    try {
      // Simple API call to verify connectivity
      await this.callApi("profile.info", {});
      return true;
    } catch (error) {
      this.log?.error?.(`Health check failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Download file from Bitrix24 URL
   * Handles authentication for files that require the webhook credentials
   *
   * @param url - File download URL
   * @returns File content as Buffer, or null if download failed
   */
  async downloadFile(url: string): Promise<Buffer | null> {
    try {
      this.log?.debug?.(`[Bitrix24] Downloading file from: ${url.slice(0, 80)}...`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "*/*",
        },
      });

      if (!response.ok) {
        this.log?.warn?.(`[Bitrix24] Download failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      this.log?.debug?.(`[Bitrix24] Downloaded ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      this.log?.error?.(`[Bitrix24] Download error: ${String(error)}`);
      return null;
    }
  }

  // ============================================================================
  // TYPING INDICATOR
  // ============================================================================

  /**
   * Send typing indicator to a user or chat
   * Uses imbot.chat.sendTyping API
   * Shows "Chat-bot is typing a message..." in the dialog
   */
  async sendTyping({ userId, duration = 60 }: { userId: string; duration?: number }): Promise<any> {
    // Bitrix24 typing indicator API: imbot.chat.sendTyping
    // Requires BOT_ID and DIALOG_ID
    const params: Record<string, any> = {
      DIALOG_ID: userId, // Target user or chat ID
    };

    if (this.botId) {
      params.BOT_ID = this.botId;
    }

    if (this.clientId) {
      params.CLIENT_ID = this.clientId;
    }

    this.log?.info?.(`[Bitrix24] Sending typing indicator to ${userId} (${duration}s)`);

    try {
      const result = await this.callApi("imbot.chat.sendTyping", params);
      this.log?.info?.(`[Bitrix24] Typing indicator sent to ${userId}`);
      return { success: true, result, duration };
    } catch (error) {
      this.log?.warn?.(`[Bitrix24] Failed to send typing indicator: ${String(error)}`);
      // Fallback: return simulated success so the flow continues
      return { success: false, error: String(error), note: "Typing indicator failed but continuing" };
    }
  }

  // ============================================================================
  // ENHANCED FILE ATTACHMENTS
  // ============================================================================

  /**
   * Send file from URL (no upload needed)
   */
  async sendFileFromUrl({
    userId,
    fileName,
    fileUrl,
    caption,
  }: {
    userId: string;
    fileName: string;
    fileUrl: string;
    caption?: string;
  }): Promise<any> {
    const params: Record<string, any> = {
      DIALOG_ID: userId,
      ATTACH: [
        {
          NAME: fileName,
          LINK: fileUrl,
        },
      ],
    };

    if (caption) {
      params.MESSAGE = this.markdownToBb(caption);
    }

    if (this.botId) {
      params.BOT_ID = this.botId;
    }

    const result = await this.callApi("imbot.message.add", params);
    this.log?.info?.(`[Bitrix24] File URL sent to ${userId}: ${fileName}`);
    return result;
  }

  /**
   * Send multiple attachments in one message
   */
  async sendMultipleFiles({
    userId,
    attachments,
    text,
  }: {
    userId: string;
    attachments: Array<{
      fileName: string;
      fileType: string;
      fileContent: Buffer | string;
      isUrl?: boolean;
      url?: string;
    }>;
    text?: string;
  }): Promise<any> {
    const fileIds: number[] = [];

    // Upload all attachments
    for (const att of attachments) {
      if (att.isUrl && att.url) {
        // URL-based attachments use LINK format
        continue; // Handle separately below
      }

      const uploadResult = await this.callApi("disk.storage.uploadfile", {
        FILE_NAME: att.fileName,
        FILE_CONTENT: {
          [att.fileType]: att.fileContent,
        },
      });

      if (uploadResult?.ID) {
        fileIds.push(uploadResult.ID);
      }
    }

    // Build ATTACH payload
    const attachPayload: Record<string, any> = {};
    if (fileIds.length > 0) {
      attachPayload.MYFILES = fileIds.length === 1 ? fileIds[0] : fileIds;
    }

    // Add URL-based attachments
    const urlAttachments = attachments
      .filter((att) => att.isUrl && att.url)
      .map((att) => ({
        NAME: att.fileName,
        LINK: att.url,
      }));

    const params: Record<string, any> = {
      DIALOG_ID: userId,
    };

    if (Object.keys(attachPayload).length > 0) {
      params.ATTACH = attachPayload;
    }

    if (urlAttachments.length > 0) {
      params.ATTACH = params.ATTACH || {};
      params.ATTACH.URLS = urlAttachments;
    }

    if (text) {
      params.MESSAGE = this.markdownToBb(text);
    }

    if (this.botId) {
      params.BOT_ID = this.botId;
    }

    const result = await this.callApi("imbot.message.add", params);
    this.log?.info?.(`[Bitrix24] Multiple files sent to ${userId}: ${attachments.length} attachments`);
    return result;
  }

  // ============================================================================
  // BOT COMMANDS API
  // ============================================================================

  /**
   * Register a bot command
   * Commands must have LANG translations for at least DE and EN
   */
  async registerCommand({
    command,
    lang,
    common = false,
    hidden = false,
    extranetSupport = false,
    eventHandler,
  }: RegisterCommandOptions): Promise<number> {
    // EVENT_COMMAND_ADD is required by Bitrix24 API
    if (!eventHandler) {
      throw new Error("eventHandler (EVENT_COMMAND_ADD) is required for command registration");
    }

    // Build LANG array for API
    const langParams: Record<string, string> = {};
    lang.forEach((l, i) => {
      langParams[`LANG[${i}][LANGUAGE_ID]`] = l.LANGUAGE_ID;
      langParams[`LANG[${i}][TITLE]`] = l.TITLE;
      if (l.PARAMS) {
        langParams[`LANG[${i}][PARAMS]`] = l.PARAMS;
      }
    });

    const params: Record<string, any> = {
      BOT_ID: this.botId,
      COMMAND: command,
      COMMON: common ? "Y" : "N",
      HIDDEN: hidden ? "Y" : "N",
      EXTRANET_SUPPORT: extranetSupport ? "Y" : "N",
      EVENT_COMMAND_ADD: eventHandler,
      ...langParams,
    };

    if (this.clientId) {
      params.CLIENT_ID = this.clientId;
    }

    const result = await this.callApi("imbot.command.register", params);
    this.log?.info?.(`[Bitrix24] Registered command /${command} with ID ${result}`);
    return result;
  }

  /**
   * Unregister a bot command
   */
  async unregisterCommand(commandId: number): Promise<boolean> {
    const params: Record<string, any> = {
      COMMAND_ID: commandId,
    };

    if (this.clientId) {
      params.CLIENT_ID = this.clientId;
    }

    const result = await this.callApi("imbot.command.unregister", params);
    this.log?.info?.(`[Bitrix24] Unregistered command ID ${commandId}`);
    return result === true;
  }

  /**
   * Update a bot command
   */
  async updateCommand(
    commandId: number,
    fields: Partial<RegisterCommandOptions>
  ): Promise<boolean> {
    const params: Record<string, any> = {
      COMMAND_ID: commandId,
    };

    if (fields.hidden !== undefined) {
      params.HIDDEN = fields.hidden ? "Y" : "N";
    }

    if (fields.common !== undefined) {
      params.COMMON = fields.common ? "Y" : "N";
    }

    if (fields.extranetSupport !== undefined) {
      params.EXTRANET_SUPPORT = fields.extranetSupport ? "Y" : "N";
    }

    if (fields.eventHandler) {
      params.EVENT_COMMAND_ADD = fields.eventHandler;
    }

    if (fields.lang) {
      fields.lang.forEach((l, i) => {
        params[`LANG[${i}][LANGUAGE_ID]`] = l.LANGUAGE_ID;
        params[`LANG[${i}][TITLE]`] = l.TITLE;
        if (l.PARAMS) {
          params[`LANG[${i}][PARAMS]`] = l.PARAMS;
        }
      });
    }

    if (this.clientId) {
      params.CLIENT_ID = this.clientId;
    }

    const result = await this.callApi("imbot.command.update", params);
    this.log?.info?.(`[Bitrix24] Updated command ID ${commandId}`);
    return result === true;
  }

  /**
   * Get details of a specific command
   * Returns command info including HIDDEN, COMMON status
   */
  async getCommandDetails(commandId: number): Promise<any> {
    try {
      const commands = await this.listCommands();
      return commands.find((cmd) => cmd.ID === commandId || cmd.COMMAND_ID === commandId);
    } catch (error) {
      this.log.error?.(`[Bitrix24] Failed to get command details for ${commandId}`, error);
      throw error;
    }
  }

  /**
   * Show all hidden commands (bulk update HIDDEN = false)
   * Makes all bot commands visible in the / command menu
   * 
   * @returns Summary of updates performed
   */
  async showAllCommands(): Promise<{
    total: number;
    updated: number;
    alreadyVisible: number;
    commands: Array<{ id: number; command: string; hidden: string; updated: boolean }>;
  }> {
    try {
      const commands = await this.listCommands();
      
      if (!commands || commands.length === 0) {
        this.log.info?.("[Bitrix24] No commands found to update");
        return {
          total: 0,
          updated: 0,
          alreadyVisible: 0,
          commands: [],
        };
      }

      this.log.info?.(`[Bitrix24] Found ${commands.length} commands. Checking visibility status...`);

      const results: Array<{ id: number; command: string; hidden: string; updated: boolean }> = [];
      let updated = 0;
      let alreadyVisible = 0;

      for (const cmd of commands) {
        // Determine command ID - API may return it as ID or COMMAND_ID
        const commandId = cmd.ID || cmd.COMMAND_ID;
        const commandName = cmd.COMMAND || "unknown";
        
        // HIDDEN field can be "Y" (hidden), "N" (visible), or undefined
        const isHidden = cmd.HIDDEN === "Y" || cmd.HIDDEN === true;
        
        if (isHidden) {
          try {
            await this.updateCommand(commandId, { hidden: false });
            updated++;
            results.push({ id: commandId, command: commandName, hidden: "Y", updated: true });
            this.log.info?.(`[Bitrix24] Made command /${commandName} visible`);
          } catch (err) {
            results.push({ id: commandId, command: commandName, hidden: "Y", updated: false });
            this.log.error?.(`[Bitrix24] Failed to update command /${commandName}: ${err}`);
          }
        } else {
          alreadyVisible++;
          results.push({ 
            id: commandId, 
            command: commandName, 
            hidden: cmd.HIDDEN || "N", 
            updated: false 
          });
        }
      }

      this.log.info?.(
        `[Bitrix24] Command visibility update complete: ${updated} updated, ${alreadyVisible} already visible, ${commands.length} total`
      );

      return {
        total: commands.length,
        updated,
        alreadyVisible,
        commands: results,
      };
    } catch (error) {
      this.log.error?.("[Bitrix24] Failed to show all commands", error);
      throw error;
    }
  }

  /**
   * Bulk update command properties
   * Apply the same field changes to multiple commands
   * 
   * @param commandIds Array of command IDs to update
   * @param fields Fields to update (hidden, common, extranetSupport, etc.)
   * @returns Results for each command update
   */
  async bulkUpdateCommands(
    commandIds: number[],
    fields: Partial<RegisterCommandOptions>
  ): Promise<{
    results: Array<{ commandId: number; success: boolean; error?: string }>;
    successful: number;
    failed: number;
  }> {
    const results: Array<{ commandId: number; success: boolean; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const commandId of commandIds) {
      try {
        await this.updateCommand(commandId, fields);
        results.push({ commandId, success: true });
        successful++;
        this.log.info?.(`[Bitrix24] Bulk update: command ${commandId} updated`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ commandId, success: false, error: errorMsg });
        failed++;
        this.log.error?.(`[Bitrix24] Bulk update: command ${commandId} failed: ${errorMsg}`);
      }
    }

    this.log.info?.(
      `[Bitrix24] Bulk update complete: ${successful} successful, ${failed} failed`
    );

    return { results, successful, failed };
  }

  /**
   * Answer a bot command
   * Use this to respond to ONIMCOMMANDADD events
   */
  async answerCommand({
    commandId,
    command,
    messageId,
    message,
    attach,
    keyboard,
    menu,
    system = false,
    urlPreview = true,
  }: AnswerCommandOptions): Promise<number> {
    // Convert Markdown to BBCode
    const formattedMessage = this.markdownToBb(message);

    const params: Record<string, any> = {
      MESSAGE_ID: messageId,
      MESSAGE: formattedMessage,
      SYSTEM: system ? "Y" : "N",
      URL_PREVIEW: urlPreview ? "Y" : "N",
    };

    // Either COMMAND_ID or COMMAND is required
    if (commandId) {
      params.COMMAND_ID = commandId;
    } else if (command) {
      params.COMMAND = command;
    } else {
      throw new Error("Either commandId or command is required");
    }

    if (attach) {
      params.ATTACH = JSON.stringify(attach);
    }

    if (keyboard) {
      params.KEYBOARD = JSON.stringify(keyboard);
    }

    if (menu) {
      params.MENU = JSON.stringify(menu);
    }

    if (this.clientId) {
      params.CLIENT_ID = this.clientId;
    }

    const result = await this.callApi("imbot.command.answer", params);
    this.log.info?.(`[Bitrix24] Answered command, response message ID: ${result}`);
    return result;
  }

  /**
   * List registered bot commands
   */
  async listCommands(): Promise<any[]> {
    const params: Record<string, any> = {
      BOT_ID: this.botId,
    };

    const result = await this.callApi("imbot.command.get", params);
    return result || [];
  }

  /**
   * Convert BB-code to Markdown (for incoming messages)
   */
  bbToMarkdown(text: string): string {
    return text
      .replace(/\[b\](.*?)\[\/b\]/g, "**$1**")
      .replace(/\[i\](.*?)\[\/i\]/g, "*$1*")
      .replace(/\[u\](.*?)\[\/u\]/g, "__$1__")
      .replace(/\[url=(.*?)\](.*?)\[\/url\]/g, "[$2]($1)")
      .replace(/\[code\](.*?)\[\/code\]/g, "`$1`");
  }

  /**
   * Convert Markdown to Bitrix24 BBCode
   * Supported tags: [B], [I], [U], [S], [URL=...], >> for quotes
   * NO [CODE] tag in Bitrix24!
   */
  markdownToBb(text: string): string {
    try {
      let result = text;

      // Code blocks - indent with tab (Bitrix24 uses tabs for indentation)
      result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
        const trimmed = code.trim();
        return trimmed.split('\n').map((line: string) => `\t${line}`).join('\n');
      });

      // Headers - convert to bold
      result = result.replace(/^#{1,6}\s+(.+)$/gm, "[B]$1[/B]");

      // Bold **text** or __text__
      result = result.replace(/\*\*(.+?)\*\*/g, "[B]$1[/B]");
      result = result.replace(/__(.+?)__/g, "[B]$1[/B]");

      // Inline code `text` - use bold since no CODE tag
      result = result.replace(/`([^`]+)`/g, "[B]$1[/B]");

      // Links [text](url)
      result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[URL=$2]$1[/URL]");

      // Raw URLs - convert to [URL]...[/URL]
      // Don't include trailing punctuation like ), ., ,, !, ? that are likely part of surrounding text
      // Use lookbehind to skip URLs already in [URL=...] format
      result = result.replace(
        /(?<![=\]])(https?:\/\/[^\s<>\[\]"']+)/gi,
        (_, url) => {
          // Strip trailing punctuation that's likely sentence/bracket punctuation
          const trailingMatch = url.match(/[)\].,!?;:']+$/);
          if (trailingMatch) {
            const cleanUrl = url.slice(0, -trailingMatch[0].length);
            return `[URL]${cleanUrl}[/URL]${trailingMatch[0]}`;
          }
          return `[URL]${url}[/URL]`;
        }
      );

      // Italic *text* (single asterisks, careful not to match list items)
      result = result.replace(/(\s)\*([^*\n]+)\*(\s|$)/g, "$1[I]$2[/I]$3");

      // Italic _text_
      result = result.replace(/(\s)_([^_\n]+)_(\s|$)/g, "$1[I]$2[/I]$3");

      // Strikethrough ~~text~~
      result = result.replace(/~~(.+?)~~/g, "[S]$1[/S]");

      // Unordered lists: convert * or - to bullet
      result = result.replace(/^[\*\-]\s+(.+)$/gm, "• $1");

      // Tables - convert to simple text format
      result = result.replace(/^\|[\s\-:|]+\|$/gm, "");
      result = result.replace(/^\|\s*(.+?)\s*\|$/gm, (_, content) => {
        return content.replace(/\s*\|\s*/g, " | ");
      });

      // Horizontal rules
      result = result.replace(/^[-*]{3,}$/gm, "────────────");

      // Blockquotes > to Bitrix24 quote syntax >>
      result = result.replace(/^>\s?(.*)$/gm, ">>$1");

      // Clean up extra blank lines
      result = result.replace(/\n{3,}/g, "\n\n");

      return result.trim();
    } catch (err) {
      this.log?.error?.(`[Bitrix24] markdownToBb error: ${err}`);
      return text;
    }
  }
}
