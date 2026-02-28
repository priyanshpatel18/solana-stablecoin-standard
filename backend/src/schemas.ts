import { z } from "zod";

const amountSchema = z.union([z.number(), z.string()]);

export const mintBodySchema = z.object({
  recipient: z.string(),
  amount: amountSchema,
  minter: z.string().optional(),
});

export const burnBodySchema = z.object({
  amount: amountSchema,
  burner: z.string().optional(),
});

export const freezeThawBodySchema = z.object({
  mint: z.string(),
  account: z.string(),
});

export const pauseUnpauseBodySchema = z.object({
  mint: z.string(),
});

export const seizeBodySchema = z.object({
  mint: z.string(),
  from: z.string(),
  to: z.string(),
  amount: amountSchema,
});

export const webhookBodySchema = z.object({
  type: z.string().optional(),
  programId: z.string().optional(),
  signature: z.string().optional(),
  logs: z.array(z.string()).optional(),
  err: z.unknown().optional(),
});

export const blacklistGetQuerySchema = z.object({
  mint: z.string().optional(),
});

export const blacklistPostBodySchema = z.object({
  mint: z.string().optional(),
  address: z.string(),
  reason: z.string().optional(),
});

export const blacklistDeleteParamsSchema = z.object({
  address: z.string(),
});

export const blacklistDeleteQuerySchema = z.object({
  mint: z.string().optional(),
});

export const screeningBodySchema = z.object({
  address: z.string(),
});

export const auditLogQuerySchema = z.object({
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  mint: z.string().optional(),
  format: z.enum(["json", "csv"]).optional(),
});

export type MintBody = z.infer<typeof mintBodySchema>;
export type BurnBody = z.infer<typeof burnBodySchema>;
export type FreezeThawBody = z.infer<typeof freezeThawBodySchema>;
export type PauseUnpauseBody = z.infer<typeof pauseUnpauseBodySchema>;
export type SeizeBody = z.infer<typeof seizeBodySchema>;
export type WebhookBody = z.infer<typeof webhookBodySchema>;
export type BlacklistGetQuery = z.infer<typeof blacklistGetQuerySchema>;
export type BlacklistPostBody = z.infer<typeof blacklistPostBodySchema>;
export type ScreeningBody = z.infer<typeof screeningBodySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
