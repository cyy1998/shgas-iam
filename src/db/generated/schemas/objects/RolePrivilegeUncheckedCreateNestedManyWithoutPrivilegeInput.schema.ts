import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateWithoutPrivilegeInput.schema';
import { RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutPrivilegeInput.schema';
import { RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateOrConnectWithoutPrivilegeInput.schema';
import { RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectSchema as RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectSchema } from './RolePrivilegeCreateManyPrivilegeInputEnvelope.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeCreateWithoutPrivilegeInputObjectSchema).array(), z.lazy(() => RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInput>;
export const RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInputObjectZodSchema = makeSchema();
