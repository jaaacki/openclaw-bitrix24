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
    dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
});
export const Bitrix24ConfigSchema = z.object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    domain: z.string().optional(),
    webhookSecret: z.string().optional(),
    userId: z.string().optional(),
    dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
    accounts: z.record(Bitrix24AccountConfigSchema).optional(),
});
