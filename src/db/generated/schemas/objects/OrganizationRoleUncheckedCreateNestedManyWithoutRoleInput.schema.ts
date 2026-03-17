import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleCreateWithoutRoleInputObjectSchema as OrganizationRoleCreateWithoutRoleInputObjectSchema } from './OrganizationRoleCreateWithoutRoleInput.schema';
import { OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema as OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema } from './OrganizationRoleUncheckedCreateWithoutRoleInput.schema';
import { OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema as OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema } from './OrganizationRoleCreateOrConnectWithoutRoleInput.schema';
import { OrganizationRoleCreateManyRoleInputEnvelopeObjectSchema as OrganizationRoleCreateManyRoleInputEnvelopeObjectSchema } from './OrganizationRoleCreateManyRoleInputEnvelope.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './OrganizationRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => OrganizationRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => OrganizationRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema), z.lazy(() => OrganizationRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput>;
export const OrganizationRoleUncheckedCreateNestedManyWithoutRoleInputObjectZodSchema = makeSchema();
