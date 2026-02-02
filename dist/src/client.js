/**
 * Bitrix24 REST API Client
 * Handles API requests to Bitrix24 with rate limiting and error handling
 */
export class Bitrix24Client {
    domain;
    webhookSecret;
    userId;
    log;
    baseUrl;
    rateLimit;
    constructor({ domain, webhookSecret, userId, log }) {
        this.domain = domain;
        this.webhookSecret = webhookSecret;
        this.userId = userId;
        this.log = log;
        // Rate limiting
        this.rateLimit = {
            requestsPerSecond: 1,
            lastRequestTime: 0,
            minWait: 1000, // 1 second
        };
        // Base API URL
        if (this.userId && this.webhookSecret) {
            // Incoming Webhook pattern: https://domain/rest/userId/secret/method
            this.baseUrl = `https://${domain}/rest/${this.userId}/${this.webhookSecret}`;
        }
        else {
            // Fallback or OAuth pattern (requires auth param)
            this.baseUrl = `https://${domain}/rest`;
        }
    }
    /**
     * Execute a Bitrix24 REST API call
     */
    async callApi(method, params = {}) {
        await this.waitForRateLimit();
        const url = `${this.baseUrl}/${method}`;
        // If we don't have userId/secret in URL (webhook mode), we might need auth param
        // But this client doesn't manage OAuth tokens yet.
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(params),
            });
            if (!response.ok) {
                throw new Error(`API error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.error) {
                throw new Error(`API error: ${data.error_description || data.error}`);
            }
            this.log.debug(`Bitrix24 API call success: ${method}`);
            return data.result;
        }
        catch (error) {
            this.log.error(`Bitrix24 API call failed: ${method}`, error);
            throw error;
        }
    }
    /**
     * Rate limiting - wait between requests
     */
    async waitForRateLimit() {
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
     * Send message to Bitrix24 user or chat
     */
    async sendMessage({ userId, text, ...options }) {
        const params = {
            USER_ID: parseInt(userId, 10),
            MESSAGE: text,
            ...options,
        };
        const result = await this.callApi("imbot.message.add", params);
        this.log.info(`Message sent to Bitrix24 user ${userId}`);
        return result;
    }
    /**
     * Register bot (get bot ID for webhook events)
     */
    async registerBot({ botName, botCode, webhookUrl, }) {
        // Set bot handler URL
        const handlerUrl = webhookUrl || `https://your-domain.com/bitrix24/webhook/${this.domain}`;
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
    async getUserInfo(userId) {
        const result = await this.callApi("user.get", {
            ID: parseInt(userId, 10),
        });
        return result && result[0] ? result[0] : null;
    }
    /**
     * Send file attachment
     */
    async sendFile({ userId, fileName, fileType, fileContent, }) {
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
    async health() {
        try {
            // Simple API call to verify connectivity
            await this.callApi("profile.info", {});
            return true;
        }
        catch (error) {
            this.log.error(`Health check failed: ${error.message}`);
            return false;
        }
    }
    /**
     * Convert BB-code to Markdown (for incoming messages)
     */
    bbToMarkdown(text) {
        return text
            .replace(/\[b\](.*?)\[\/b\]/g, "**$1**")
            .replace(/\[i\](.*?)\[\/i\]/g, "*$1*")
            .replace(/\[u\](.*?)\[\/u\]/g, "__$1__")
            .replace(/\[url=(.*?)\](.*?)\[\/url\]/g, "[$2]($1)")
            .replace(/\[code\](.*?)\[\/code\]/g, "`$1`");
    }
    /**
     * Convert Markdown to BB-code (for outgoing messages)
     */
    markdownToBb(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, "[b]$1[/b]")
            .replace(/\*(.*?)\*/g, "[i]$1[/i]")
            .replace(/__(.*?)__/g, "[u]$1[/u]")
            .replace(/\[(.*?)\]\((.*?)\)/g, "[url=$2]$1[/url]")
            .replace(/`(.*?)`/g, "[code]$1[/code]");
    }
}
