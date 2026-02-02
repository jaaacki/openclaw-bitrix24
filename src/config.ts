/**
 * Bitrix24 configuration schema and types
 */

import { z } from "zod";

export const Bitrix24AccountConfigSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  domain: z.string().optional(),
  webhookSecret: z.string().optional(),
  userId: z.string().optional(),
  botId: z.string().optional(),
  clientId: z.string().optional(), // application_token for bot API calls
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
});

export const Bitrix24ConfigSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  domain: z.string().optional(),
  webhookSecret: z.string().optional(),
  userId: z.string().optional(),
  botId: z.string().optional(),
  clientId: z.string().optional(), // application_token for bot API calls
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
  accounts: z.record(z.string(), Bitrix24AccountConfigSchema).optional(),
});

export type Bitrix24Config = z.infer<typeof Bitrix24ConfigSchema>;
export type Bitrix24AccountConfig = z.infer<typeof Bitrix24AccountConfigSchema>;

export interface ResolvedBitrix24Account {
  accountId: string;
  name: string;
  enabled: boolean;
  domain: string;
  webhookSecret: string;
  userId?: string;
  botId?: string;
  clientId?: string; // application_token for bot API calls
  config: Bitrix24AccountConfig;
}
