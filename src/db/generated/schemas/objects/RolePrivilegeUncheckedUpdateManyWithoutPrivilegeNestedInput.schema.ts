import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateWithoutPrivilegeInput.schema';
import { RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutPrivilegeInput.schema';
import { RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateOrConnectWithoutPrivilegeInput.schema';
import { RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema as RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput.schema';
import { RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectSchema as RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectSchema } from './RolePrivilegeCreateManyPrivilegeInputEnvelope.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema as RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput.schema';
import { RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInputObjectSchema as RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput.schema';
import { RolePrivilegeScalarWhereInputObjectSchema as RolePrivilegeScalarWhereInputObjectSchema } from './RolePrivilegeScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeCreateWithoutPrivilegeInputObjectSchema).array(), z.lazy(() => RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeCreateOrConnectWithoutPrivilegeInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => RolePrivilegeCreateManyPrivilegeInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInputObjectSchema), z.lazy(() => RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema), z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const RolePrivilegeUncheckedUpdateManyWithoutPrivilegeNestedInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedUpdateManyWithoutPrivilegeNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedUpdateManyWithoutPrivilegeNestedInput>;
export const RolePrivilegeUncheckedUpdateManyWithoutPrivilegeNestedInputObjectZodSchema = makeSchema();
