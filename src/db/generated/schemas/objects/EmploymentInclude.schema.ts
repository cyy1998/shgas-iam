import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserArgsObjectSchema as UserArgsObjectSchema } from './UserArgs.schema';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { PositionArgsObjectSchema as PositionArgsObjectSchema } from './PositionArgs.schema';
import { PosOrgCompositionArgsObjectSchema as PosOrgCompositionArgsObjectSchema } from './PosOrgCompositionArgs.schema';
import { EmploymentRoleFindManySchema as EmploymentRoleFindManySchema } from '../findManyEmploymentRole.schema';
import { EmploymentCountOutputTypeArgsObjectSchema as EmploymentCountOutputTypeArgsObjectSchema } from './EmploymentCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  user: z.union([z.boolean(), z.lazy(() => UserArgsObjectSchema)]).optional(),
  deptartment: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  company: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  position: z.union([z.boolean(), z.lazy(() => PositionArgsObjectSchema)]).optional(),
  posOrg: z.union([z.boolean(), z.lazy(() => PosOrgCompositionArgsObjectSchema)]).optional(),
  roles: z.union([z.boolean(), z.lazy(() => EmploymentRoleFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => EmploymentCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const EmploymentIncludeObjectSchema: z.ZodType<Prisma.EmploymentInclude> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentInclude>;
export const EmploymentIncludeObjectZodSchema = makeSchema();
