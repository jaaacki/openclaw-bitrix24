/**
 * Bitrix24 REST API Client
 * Handles API requests to Bitrix24 with rate limiting and error handling
 */

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
    this.log.debug?.(`[Bitrix24] API call: ${method} to ${fullUrl}`);

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

      this.log.debug(`Bitrix24 API call success: ${method}`);
      return data.result;
    } catch (error) {
      this.log.error(`Bitrix24 API call failed: ${method}`, error);
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
      this.log.debug(`Rate limiting: waiting ${waitTime}ms`);
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

    this.log.info(`Bot ${botCode} registered for ${this.domain}`);
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
      this.log.error(`Health check failed: ${(error as Error).message}`);
      return false;
    }
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
