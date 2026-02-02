/**
 * Bitrix24 account resolution
 */
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ResolvedBitrix24Account } from "./config.js";
/**
 * List all configured Bitrix24 account IDs
 */
export declare function listBitrix24AccountIds(cfg: OpenClawConfig): string[];
/**
 * Resolve the default account ID
 */
export declare function resolveDefaultBitrix24AccountId(cfg: OpenClawConfig): string;
/**
 * Resolve a Bitrix24 account from config
 */
export declare function resolveBitrix24Account({ cfg, accountId, }: {
    cfg: OpenClawConfig;
    accountId?: string;
}): ResolvedBitrix24Account;
//# sourceMappingURL=accounts.d.ts.map