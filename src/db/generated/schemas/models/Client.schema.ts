import * as z from 'zod';

export const ClientSchema = z.object({
  id: z.number().int(),
  clientCode: z.string(),
  clientName: z.string(),
  url: z.string().nullish(),
  status: z.number().int().default(1),
  description: z.string().nullish(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  extAttributes: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10"),
});

export type ClientType = z.infer<typeof ClientSchema>;
