/**
 * Bitrix24 REST API Client
 * Handles API requests to Bitrix24 with rate limiting and error handling
 */
interface Bitrix24ClientOptions {
    domain: string;
    webhookSecret: string;
    userId?: string;
    log: any;
}
interface SendMessageOptions {
    userId: string;
    text: string;
    [key: string]: any;
}
export declare class Bitrix24Client {
    private domain;
    private webhookSecret;
    private userId?;
    private log;
    private baseUrl;
    private rateLimit;
    constructor({ domain, webhookSecret, userId, log }: Bitrix24ClientOptions);
    /**
     * Execute a Bitrix24 REST API call
     */
    callApi(method: string, params?: Record<string, any>): Promise<any>;
    /**
     * Rate limiting - wait between requests
     */
    private waitForRateLimit;
    /**
     * Send message to Bitrix24 user or chat
     */
    sendMessage({ userId, text, ...options }: SendMessageOptions): Promise<any>;
    /**
     * Register bot (get bot ID for webhook events)
     */
    registerBot({ botName, botCode, webhookUrl, }: {
        botName: string;
        botCode: string;
        webhookUrl?: string;
    }): Promise<any>;
    /**
     * Get user info by ID
     */
    getUserInfo(userId: string): Promise<any>;
    /**
     * Send file attachment
     */
    sendFile({ userId, fileName, fileType, fileContent, }: {
        userId: string;
        fileName: string;
        fileType: string;
        fileContent: any;
    }): Promise<any>;
    /**
     * Health check - verify connection to Bitrix24
     */
    health(): Promise<boolean>;
    /**
     * Convert BB-code to Markdown (for incoming messages)
     */
    bbToMarkdown(text: string): string;
    /**
     * Convert Markdown to BB-code (for outgoing messages)
     */
    markdownToBb(text: string): string;
}
export {};
//# sourceMappingURL=client.d.ts.map