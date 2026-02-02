/**
 * Bitrix24 Channel Plugin
 * Implements OpenClaw's ChannelPlugin interface for Bitrix24
 */
import { buildChannelConfigSchema, getChatChannelMeta, } from "openclaw/plugin-sdk";
import { Bitrix24ConfigSchema } from "./config.js";
import { getBitrix24Runtime } from "./runtime.js";
import { resolveBitrix24Account, listBitrix24AccountIds, resolveDefaultBitrix24AccountId, } from "./accounts.js";
import { Bitrix24Client } from "./client.js";
const meta = getChatChannelMeta("bitrix24");
export const bitrix24Plugin = {
    id: "bitrix24",
    meta: {
        ...meta,
        quickstartAllowFrom: false,
    },
    capabilities: {
        chatTypes: ["direct", "group"],
        reactions: false,
        threads: false,
        media: true,
        nativeCommands: false,
        blockStreaming: false,
    },
    reload: { configPrefixes: ["channels.bitrix24"] },
    configSchema: buildChannelConfigSchema(Bitrix24ConfigSchema),
    config: {
        listAccountIds: (cfg) => listBitrix24AccountIds(cfg),
        resolveAccount: (cfg, accountId) => resolveBitrix24Account({ cfg, accountId }),
        defaultAccountId: (cfg) => resolveDefaultBitrix24AccountId(cfg),
        setAccountEnabled: ({ cfg, accountId, enabled }) => {
            const next = { ...cfg };
            if (!next.channels)
                next.channels = {};
            if (!next.channels.bitrix24)
                next.channels.bitrix24 = {};
            if (accountId === "default") {
                next.channels.bitrix24.enabled = enabled;
            }
            else {
                if (!next.channels.bitrix24.accounts)
                    next.channels.bitrix24.accounts = {};
                if (!next.channels.bitrix24.accounts[accountId]) {
                    next.channels.bitrix24.accounts[accountId] = {};
                }
                next.channels.bitrix24.accounts[accountId].enabled = enabled;
            }
            return next;
        },
        deleteAccount: ({ cfg, accountId }) => {
            const next = { ...cfg };
            if (!next.channels?.bitrix24)
                return next;
            if (accountId === "default") {
                delete next.channels.bitrix24.domain;
                delete next.channels.bitrix24.webhookSecret;
                delete next.channels.bitrix24.userId;
            }
            else if (next.channels.bitrix24.accounts?.[accountId]) {
                delete next.channels.bitrix24.accounts[accountId];
            }
            return next;
        },
        isConfigured: (account) => Boolean(account.domain?.trim() && account.webhookSecret?.trim()),
        describeAccount: (account) => ({
            accountId: account.accountId,
            name: account.name || account.domain || "unnamed",
            enabled: account.enabled,
            configured: Boolean(account.domain?.trim() && account.webhookSecret?.trim()),
            domain: account.domain,
        }),
        resolveAllowFrom: () => [],
        formatAllowFrom: () => [],
    },
    security: {
        resolveDmPolicy: ({ account }) => ({
            policy: account.config.dmPolicy || "open",
            allowFrom: [],
            policyPath: "channels.bitrix24.dmPolicy",
            allowFromPath: "channels.bitrix24.",
            approveHint: null,
            normalizeEntry: (raw) => raw,
        }),
        collectWarnings: () => [],
    },
    groups: {
        resolveRequireMention: () => false,
        resolveToolPolicy: () => "auto",
    },
    threading: {
        resolveReplyToMode: () => "none",
    },
    messaging: {
        normalizeTarget: ({ target }) => {
            if (!target)
                return null;
            const str = String(target).trim();
            if (!str)
                return null;
            // Support formats: "domain/userId", "userId"
            if (str.includes("/")) {
                const [domain, userId] = str.split("/");
                return { display: str, resolved: str, domain, userId };
            }
            return { display: str, resolved: str, userId: str };
        },
        targetResolver: {
            looksLikeId: (target) => /^\d+$/.test(target) || /^[a-z0-9.-]+\/\d+$/i.test(target),
            hint: "<domain>/<userId> or <userId>",
        },
    },
    directory: {
        self: async () => null,
        listPeers: async () => [],
        listGroups: async () => [],
    },
    outbound: {
        deliveryMode: "direct",
        chunker: (text, limit) => {
            const chunks = [];
            let remaining = text;
            while (remaining.length > 0) {
                if (remaining.length <= limit) {
                    chunks.push(remaining);
                    break;
                }
                let splitIndex = remaining.lastIndexOf("\n", limit);
                if (splitIndex === -1 || splitIndex < limit / 2) {
                    splitIndex = remaining.lastIndexOf(" ", limit);
                }
                if (splitIndex === -1 || splitIndex < limit / 2) {
                    splitIndex = limit;
                }
                chunks.push(remaining.slice(0, splitIndex).trim());
                remaining = remaining.slice(splitIndex).trim();
            }
            return chunks;
        },
        chunkerMode: "text",
        textChunkLimit: 4000,
        sendText: async ({ to, text, accountId }) => {
            const client = await getClientForAccount(accountId);
            // Parse target format
            const target = typeof to === "string" ? to : String(to);
            const userId = target.includes("/") ? target.split("/")[1] : target;
            const result = await client.sendMessage({
                userId,
                text,
            });
            return {
                channel: "bitrix24",
                messageId: result.message_id ? String(result.message_id) : undefined,
                success: true,
            };
        },
        sendMedia: async ({ to, text, mediaUrl, accountId }) => {
            const client = await getClientForAccount(accountId);
            // Parse target format
            const target = typeof to === "string" ? to : String(to);
            const userId = target.includes("/") ? target.split("/")[1] : target;
            // For media, send URL in message (Bitrix24 API may need file handling)
            const messageText = mediaUrl ? `${text}\n\n${mediaUrl}` : text;
            const result = await client.sendMessage({
                userId,
                text: messageText,
            });
            return {
                channel: "bitrix24",
                messageId: result.message_id ? String(result.message_id) : undefined,
                success: true,
            };
        },
    },
    status: {
        defaultRuntime: {
            accountId: "default",
            running: false,
            lastStartAt: null,
            lastStopAt: null,
            lastError: null,
        },
        collectStatusIssues: ({ account }) => {
            const issues = [];
            if (!account.domain) {
                issues.push("Bitrix24 domain not configured");
            }
            if (!account.webhookSecret) {
                issues.push("Webhook secret not configured");
            }
            return issues;
        },
        buildChannelSummary: ({ snapshot }) => ({
            configured: snapshot.configured ?? false,
            domain: snapshot.domain ?? "none",
            running: snapshot.running ?? false,
            lastStartAt: snapshot.lastStartAt ?? null,
            lastStopAt: snapshot.lastStopAt ?? null,
            lastError: snapshot.lastError ?? null,
        }),
        probeAccount: async ({ account }) => {
            if (!account.domain || !account.webhookSecret) {
                return { ok: false, error: "Account not configured" };
            }
            const client = new Bitrix24Client({
                domain: account.domain,
                webhookSecret: account.webhookSecret,
                userId: account.userId,
                log: getBitrix24Runtime().logging,
            });
            try {
                const isHealthy = await client.health();
                return { ok: isHealthy, domain: account.domain };
            }
            catch (err) {
                return { ok: false, error: String(err) };
            }
        },
        buildAccountSnapshot: ({ account, runtime, probe }) => ({
            accountId: account.accountId,
            name: account.name || account.domain || "unnamed",
            enabled: account.enabled,
            configured: Boolean(account.domain?.trim() && account.webhookSecret?.trim()),
            domain: account.domain,
            running: runtime?.running ?? false,
            lastStartAt: runtime?.lastStartAt ?? null,
            lastStopAt: runtime?.lastStopAt ?? null,
            lastError: runtime?.lastError ?? null,
            probe,
        }),
    },
    gateway: {
        startAccount: async (ctx) => {
            const account = ctx.account;
            ctx.log?.info(`[${account.accountId}] starting Bitrix24 provider for domain ${account.domain}`);
            // For Bitrix24, we don't have long-polling like Telegram
            // The integration works via webhooks configured in Bitrix24 admin panel
            // This is a passive listener that just confirms the account is ready
            return new Promise((resolve) => {
                // Just keep the provider "running" without blocking
                ctx.abortSignal.addEventListener("abort", () => {
                    ctx.log?.info(`[${account.accountId}] stopping Bitrix24 provider`);
                    resolve();
                });
            });
        },
        logoutAccount: async ({ accountId, cfg }) => {
            const nextCfg = { ...cfg };
            const nextBitrix24 = cfg.channels?.bitrix24 ? { ...cfg.channels.bitrix24 } : undefined;
            let cleared = false;
            let changed = false;
            if (nextBitrix24) {
                if (accountId === "default") {
                    if (nextBitrix24.webhookSecret) {
                        delete nextBitrix24.webhookSecret;
                        delete nextBitrix24.domain;
                        delete nextBitrix24.userId;
                        cleared = true;
                        changed = true;
                    }
                }
                const accounts = nextBitrix24.accounts;
                if (accounts && accountId in accounts) {
                    delete accounts[accountId];
                    changed = true;
                    cleared = true;
                }
            }
            if (changed) {
                if (nextBitrix24 && Object.keys(nextBitrix24).length > 0) {
                    nextCfg.channels = { ...nextCfg.channels, bitrix24: nextBitrix24 };
                }
                else {
                    const nextChannels = { ...nextCfg.channels };
                    delete nextChannels.bitrix24;
                    nextCfg.channels = Object.keys(nextChannels).length > 0 ? nextChannels : undefined;
                }
                await getBitrix24Runtime().config.writeConfigFile(nextCfg);
            }
            const resolved = resolveBitrix24Account({ cfg: changed ? nextCfg : cfg, accountId });
            const loggedOut = !resolved.domain || !resolved.webhookSecret;
            return { cleared, envToken: false, loggedOut };
        },
    },
};
/**
 * Helper to get a Bitrix24 client for the given account
 */
async function getClientForAccount(accountId) {
    const cfg = await getBitrix24Runtime().config.readConfigFile();
    const account = resolveBitrix24Account({ cfg, accountId: accountId || "default" });
    if (!account.domain || !account.webhookSecret) {
        throw new Error(`Bitrix24 account ${accountId || "default"} not configured`);
    }
    return new Bitrix24Client({
        domain: account.domain,
        webhookSecret: account.webhookSecret,
        userId: account.userId,
        log: getBitrix24Runtime().logging,
    });
}
