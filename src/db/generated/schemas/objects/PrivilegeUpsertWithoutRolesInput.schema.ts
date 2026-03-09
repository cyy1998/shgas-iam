import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeUpdateWithoutRolesInputObjectSchema as PrivilegeUpdateWithoutRolesInputObjectSchema } from './PrivilegeUpdateWithoutRolesInput.schema';
import { PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema as PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema } from './PrivilegeUncheckedUpdateWithoutRolesInput.schema';
import { PrivilegeCreateWithoutRolesInputObjectSchema as PrivilegeCreateWithoutRolesInputObjectSchema } from './PrivilegeCreateWithoutRolesInput.schema';
import { PrivilegeUncheckedCreateWithoutRolesInputObjectSchema as PrivilegeUncheckedCreateWithoutRolesInputObjectSchema } from './PrivilegeUncheckedCreateWithoutRolesInput.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './PrivilegeWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PrivilegeUpdateWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema)]),
  create: z.union([z.lazy(() => PrivilegeCreateWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutRolesInputObjectSchema)]),
  where: z.lazy(() => PrivilegeWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeUpsertWithoutRolesInputObjectSchema: z.ZodType<Prisma.PrivilegeUpsertWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUpsertWithoutRolesInput>;
export const PrivilegeUpsertWithoutRolesInputObjectZodSchema = makeSchema();
