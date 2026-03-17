import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeFindManySchema as RolePrivilegeFindManySchema } from '../findManyRolePrivilege.schema';
import { DelegationDetailFindManySchema as DelegationDetailFindManySchema } from '../findManyDelegationDetail.schema';
import { PrivilegeCountOutputTypeArgsObjectSchema as PrivilegeCountOutputTypeArgsObjectSchema } from './PrivilegeCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  roles: z.union([z.boolean(), z.lazy(() => RolePrivilegeFindManySchema)]).optional(),
  delegations: z.union([z.boolean(), z.lazy(() => DelegationDetailFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => PrivilegeCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const PrivilegeIncludeObjectSchema: z.ZodType<Prisma.PrivilegeInclude> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeInclude>;
export const PrivilegeIncludeObjectZodSchema = makeSchema();
