import { z } from '@hono/zod-openapi';

export const QueryModeSchema = z.enum(['default', 'insensitive'])

export type QueryMode = z.infer<typeof QueryModeSchema>;