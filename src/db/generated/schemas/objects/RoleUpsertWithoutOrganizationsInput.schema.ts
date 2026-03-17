import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateWithoutOrganizationsInputObjectSchema as RoleUpdateWithoutOrganizationsInputObjectSchema } from './RoleUpdateWithoutOrganizationsInput.schema';
import { RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema as RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema } from './RoleUncheckedUpdateWithoutOrganizationsInput.schema';
import { RoleCreateWithoutOrganizationsInputObjectSchema as RoleCreateWithoutOrganizationsInputObjectSchema } from './RoleCreateWithoutOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutOrganizationsInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => RoleUpdateWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema)]),
  create: z.union([z.lazy(() => RoleCreateWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutOrganizationsInputObjectSchema)]),
  where: z.lazy(() => RoleWhereInputObjectSchema).optional()
}).strict();
export const RoleUpsertWithoutOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleUpsertWithoutOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpsertWithoutOrganizationsInput>;
export const RoleUpsertWithoutOrganizationsInputObjectZodSchema = makeSchema();
