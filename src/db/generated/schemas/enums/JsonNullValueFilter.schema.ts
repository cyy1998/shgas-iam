import { z } from '@hono/zod-openapi';

export const JsonNullValueFilterSchema = z.enum(['DbNull', 'JsonNull', 'AnyNull'])

export type JsonNullValueFilter = z.infer<typeof JsonNullValueFilterSchema>;