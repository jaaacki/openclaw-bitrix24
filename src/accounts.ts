/**
 * Bitrix24 account resolution
 * Resolves account configuration from OpenClaw config
 *
 * @module accounts
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { ResolvedBitrix24Account, Bitrix24Config } from "./config.js";

const DEFAULT_ACCOUNT_ID = "default";

/**
 * List all configured Bitrix24 account IDs
 */
export function listBitrix24AccountIds(cfg: OpenClawConfig): string[] {
  const bitrix24Config = cfg.channels?.bitrix24 as Bitrix24Config | undefined;
  if (!bitrix24Config) return [];
  
  const ids: string[] = [];
  
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
export function resolveDefaultBitrix24AccountId(cfg: OpenClawConfig): string {
  const ids = listBitrix24AccountIds(cfg);
  return ids.length > 0 ? ids[0] : DEFAULT_ACCOUNT_ID;
}

/**
 * Resolve a Bitrix24 account from config
 */
export function resolveBitrix24Account({
  cfg,
  accountId,
}: {
  cfg: OpenClawConfig;
  accountId?: string;
}): ResolvedBitrix24Account {
  const bitrix24Config = cfg.channels?.bitrix24 as Bitrix24Config | undefined;
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
      botId: bitrix24Config.botId,
      clientId: bitrix24Config.clientId,
      customCommands: bitrix24Config.customCommands,
      config: {
        enabled: bitrix24Config.enabled,
        name: bitrix24Config.name,
        domain: bitrix24Config.domain,
        webhookSecret: bitrix24Config.webhookSecret,
        userId: bitrix24Config.userId,
        botId: bitrix24Config.botId,
        clientId: bitrix24Config.clientId,
        dmPolicy: bitrix24Config.dmPolicy,
        customCommands: bitrix24Config.customCommands,
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
    botId: accountConfig.botId,
    clientId: accountConfig.clientId,
    customCommands: accountConfig.customCommands,
    config: accountConfig,
  };
}
