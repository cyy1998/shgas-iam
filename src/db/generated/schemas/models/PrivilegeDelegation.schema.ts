import { z } from '@hono/zod-openapi';

export const PrivilegeDelegationSchema = z.object({
  id: z.number().int(),
  delegatorUserId: z.number().int(),
  delegateeUserId: z.number().int(),
  organizationScopeId: z.number().int(),
  startTime: z.date(),
  endTime: z.date(),
  status: z.number().int().default(1),
  description: z.string().nullish(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
});

export type PrivilegeDelegationType = z.infer<typeof PrivilegeDelegationSchema>;
