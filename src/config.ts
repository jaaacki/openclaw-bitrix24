/**
 * Bitrix24 configuration schema and types
 */

import { z } from "zod";

// Command name pattern: Latin letters, numbers only (Bitrix24 requirement)
export const BITRIX24_COMMAND_NAME_PATTERN = /^[a-z0-9]{1,32}$/;

// Custom command definition
export const Bitrix24CommandSchema = z.object({
  command: z.string().regex(BITRIX24_COMMAND_NAME_PATTERN,
    "Command must be 1-32 lowercase letters or numbers"),
  description: z.string().max(100).optional(),
  descriptionDe: z.string().max(100).optional(), // German translation (required by Bitrix24)
  params: z.string().max(100).optional(), // Parameter hint (e.g., "[query]")
  common: z.boolean().optional(), // Global command (works in all chats)
  hidden: z.boolean().optional(), // Hidden from command list
});

export const Bitrix24AccountConfigSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  domain: z.string().optional(),
  webhookSecret: z.string().optional(),
  userId: z.string().optional(),
  botId: z.string().optional(),
  clientId: z.string().optional(), // application_token for bot API calls
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
  customCommands: z.array(Bitrix24CommandSchema).optional(),
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
  // Commands configuration
  customCommands: z.array(Bitrix24CommandSchema).optional(),
  registerCommandsOnStartup: z.boolean().optional(), // Auto-register commands
  webhookUrl: z.string().url().optional(), // Public URL for command webhook (e.g., https://openclaw.example.com/chan/bitrix24/webhook)
});

export type Bitrix24Config = z.infer<typeof Bitrix24ConfigSchema>;
export type Bitrix24AccountConfig = z.infer<typeof Bitrix24AccountConfigSchema>;
export type Bitrix24Command = z.infer<typeof Bitrix24CommandSchema>;

export interface ResolvedBitrix24Account {
  accountId: string;
  name: string;
  enabled: boolean;
  domain: string;
  webhookSecret: string;
  userId?: string;
  botId?: string;
  clientId?: string; // application_token for bot API calls
  customCommands?: Bitrix24Command[];
  config: Bitrix24AccountConfig;
}

/**
 * Validate command name follows Bitrix24 requirements
 */
export function isValidCommandName(name: string): boolean {
  return BITRIX24_COMMAND_NAME_PATTERN.test(name);
}

/**
 * Build LANG array for Bitrix24 command registration
 * Bitrix24 requires at least DE and EN translations
 */
export function buildCommandLang(command: Bitrix24Command): Array<{
  LANGUAGE_ID: string;
  TITLE: string;
  PARAMS?: string;
}> {
  const description = command.description || `/${command.command} command`;
  const descriptionDe = command.descriptionDe || description;

  return [
    {
      LANGUAGE_ID: "en",
      TITLE: description,
      PARAMS: command.params,
    },
    {
      LANGUAGE_ID: "de",
      TITLE: descriptionDe,
      PARAMS: command.params,
    },
  ];
}
