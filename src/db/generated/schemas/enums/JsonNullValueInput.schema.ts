import { z } from '@hono/zod-openapi';

export const JsonNullValueInputSchema = z.enum(['JsonNull'])

export type JsonNullValueInput = z.infer<typeof JsonNullValueInputSchema>;