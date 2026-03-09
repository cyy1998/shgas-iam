import { z } from '@hono/zod-openapi';

export const SortOrderSchema = z.enum(['asc', 'desc'])

export type SortOrder = z.infer<typeof SortOrderSchema>;