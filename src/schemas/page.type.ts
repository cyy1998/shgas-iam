import { z } from '@hono/zod-openapi';

export const PageQuerySchema = z.object({
  conditions: z.unknown(),
  pageNum: z.int().positive().default(1),
  pageSize: z.int().positive().default(10),
}).openapi('PageQuerySchema');

export type PageQuery = z.infer<typeof PageQuerySchema>;

export const PageResultSchema = z.object({
  result: z.array(z.unknown()),
  total: z.int().nonnegative().openapi({ example: 50 }),
  pageNum: z.int().positive().default(1),
  pageSize: z.int().positive().default(10),
  pages: z.int().nonnegative(),
}).openapi('PageResultSchema');

export function createPageResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    result: dataSchema,
    total: z.int().nonnegative().openapi({ example: 50 }),
    pageNum: z.int().positive().default(1),
    pageSize: z.int().positive().default(10),
    pages: z.int().nonnegative(),
  });
}

export function createPageQuerySchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    conditions: dataSchema,
    pageNum: z.int().positive().default(1),
    pageSize: z.int().positive().default(10),
  });
}
