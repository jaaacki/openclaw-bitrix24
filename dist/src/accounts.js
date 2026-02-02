/**
 * Bitrix24 account resolution
 */
const DEFAULT_ACCOUNT_ID = "default";
/**
 * List all configured Bitrix24 account IDs
 */
export function listBitrix24AccountIds(cfg) {
    const bitrix24Config = cfg.channels?.bitrix24;
    if (!bitrix24Config)
        return [];
    const ids = [];
    // Check if default account is configured
    if (bitrix24Config.domain || bitrix24Config.webhookSecret) {
        ids.push(DEFAULT_ACCOUNT_ID);
    }
    // Add named accounts
    if (bitrix24Config.accounts) {
        ids.push(...Object.keys(bitrix24Config.accounts));
    }
    return ids;
}
/**
 * Resolve the default account ID
 */
export function resolveDefaultBitrix24AccountId(cfg) {
    const ids = listBitrix24AccountIds(cfg);
    return ids.length > 0 ? ids[0] : DEFAULT_ACCOUNT_ID;
}
/**
 * Resolve a Bitrix24 account from config
 */
export function resolveBitrix24Account({ cfg, accountId, }) {
    const bitrix24Config = cfg.channels?.bitrix24;
    const resolvedAccountId = accountId || resolveDefaultBitrix24AccountId(cfg);
    if (!bitrix24Config) {
        return {
            accountId: resolvedAccountId,
            name: "",
            enabled: false,
            domain: "",
            webhookSecret: "",
            config: {},
        };
    }
    // Default account (top-level config)
    if (resolvedAccountId === DEFAULT_ACCOUNT_ID) {
        return {
            accountId: DEFAULT_ACCOUNT_ID,
            name: bitrix24Config.name || bitrix24Config.domain || "default",
            enabled: bitrix24Config.enabled ?? true,
            domain: bitrix24Config.domain || "",
            webhookSecret: bitrix24Config.webhookSecret || "",
            userId: bitrix24Config.userId,
            config: {
                enabled: bitrix24Config.enabled,
                name: bitrix24Config.name,
                domain: bitrix24Config.domain,
                webhookSecret: bitrix24Config.webhookSecret,
                userId: bitrix24Config.userId,
                dmPolicy: bitrix24Config.dmPolicy,
            },
        };
    }
    // Named account
    const accountConfig = bitrix24Config.accounts?.[resolvedAccountId];
    if (!accountConfig) {
        return {
            accountId: resolvedAccountId,
            name: "",
            enabled: false,
            domain: "",
            webhookSecret: "",
            config: {},
        };
    }
    return {
        accountId: resolvedAccountId,
        name: accountConfig.name || accountConfig.domain || resolvedAccountId,
        enabled: accountConfig.enabled ?? true,
        domain: accountConfig.domain || "",
        webhookSecret: accountConfig.webhookSecret || "",
        userId: accountConfig.userId,
        config: accountConfig,
    };
}
