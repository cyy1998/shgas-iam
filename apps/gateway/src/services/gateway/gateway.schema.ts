import { z } from "zod";

export const gatewayInputSchema = z
  .object({
    scope: z.string().min(1).max(256),
    yaml: z.string().min(1),
    variables: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type GatewayInput = z.infer<typeof gatewayInputSchema>;

export const gatewayApplyInputSchema = gatewayInputSchema
  .extend({
    dryRun: z.boolean().default(false),
    prune: z.boolean().default(false),
  })
  .strict();

export type GatewayApplyInput = z.infer<typeof gatewayApplyInputSchema>;
