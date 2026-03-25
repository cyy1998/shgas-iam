import * as z from 'zod';
export const LoginLogFindManyResultSchema = z.object({
  data: z.array(z.object({
  id: z.number().int(),
  userId: z.number().int(),
  username: z.string(),
  name: z.string(),
  clientCode: z.string(),
  loginType: z.string(),
  loginTime: z.date()
})),
  pagination: z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean()
})
});