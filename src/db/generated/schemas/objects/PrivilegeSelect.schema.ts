import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeFindManySchema as RolePrivilegeFindManySchema } from '../findManyRolePrivilege.schema';
import { DelegationDetailFindManySchema as DelegationDetailFindManySchema } from '../findManyDelegationDetail.schema';
import { PrivilegeCountOutputTypeArgsObjectSchema as PrivilegeCountOutputTypeArgsObjectSchema } from './PrivilegeCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  privilegeCode: z.boolean().optional(),
  privilegeName: z.boolean().optional(),
  fieldValues: z.boolean().optional(),
  status: z.boolean().optional(),
  description: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  roles: z.union([z.boolean(), z.lazy(() => RolePrivilegeFindManySchema)]).optional(),
  delegations: z.union([z.boolean(), z.lazy(() => DelegationDetailFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PrivilegeCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PrivilegeSelectObjectSchema: z.ZodType<Prisma.PrivilegeSelect> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeSelect>;
export const PrivilegeSelectObjectZodSchema = makeSchema();
