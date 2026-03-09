import { z } from '@hono/zod-openapi';

export const NullsOrderSchema = z.enum(['first', 'last'])

export type NullsOrder = z.infer<typeof NullsOrderSchema>;