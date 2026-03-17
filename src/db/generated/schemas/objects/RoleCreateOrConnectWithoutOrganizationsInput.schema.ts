import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleCreateWithoutOrganizationsInputObjectSchema as RoleCreateWithoutOrganizationsInputObjectSchema } from './RoleCreateWithoutOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutOrganizationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => RoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => RoleCreateWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutOrganizationsInputObjectSchema)])
}).strict();
export const RoleCreateOrConnectWithoutOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleCreateOrConnectWithoutOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCreateOrConnectWithoutOrganizationsInput>;
export const RoleCreateOrConnectWithoutOrganizationsInputObjectZodSchema = makeSchema();
