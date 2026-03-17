import * as z from 'zod';
export const PrivilegeDeleteResultSchema = z.nullable(z.object({
  id: z.number().int(),
  privilegeCode: z.string(),
  privilegeName: z.string(),
  fieldValues: z.unknown().optional(),
  status: z.number().int(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  roles: z.array(z.unknown()),
  delegations: z.array(z.unknown())
}));