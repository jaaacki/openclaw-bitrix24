/**
 * Bitrix24 configuration schema and types
 */
import { z } from "zod";
export declare const Bitrix24AccountConfigSchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    name: z.ZodOptional<z.ZodString>;
    domain: z.ZodOptional<z.ZodString>;
    webhookSecret: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    dmPolicy: z.ZodOptional<z.ZodEnum<{
        open: "open";
        pairing: "pairing";
        allowlist: "allowlist";
    }>>;
}, z.core.$strip>;
export declare const Bitrix24ConfigSchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    name: z.ZodOptional<z.ZodString>;
    domain: z.ZodOptional<z.ZodString>;
    webhookSecret: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    dmPolicy: z.ZodOptional<z.ZodEnum<{
        open: "open";
        pairing: "pairing";
        allowlist: "allowlist";
    }>>;
    accounts: z.ZodOptional<z.ZodRecord<z.core.$ZodRecordKey, z.core.SomeType>>;
}, z.core.$strip>;
export type Bitrix24Config = z.infer<typeof Bitrix24ConfigSchema>;
export type Bitrix24AccountConfig = z.infer<typeof Bitrix24AccountConfigSchema>;
export interface ResolvedBitrix24Account {
    accountId: string;
    name: string;
    enabled: boolean;
    domain: string;
    webhookSecret: string;
    userId?: string;
    config: Bitrix24AccountConfig;
}
//# sourceMappingURL=config.d.ts.map