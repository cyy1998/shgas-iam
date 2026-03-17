import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeCreateWithoutRoleInputObjectSchema as RolePrivilegeCreateWithoutRoleInputObjectSchema } from './RolePrivilegeCreateWithoutRoleInput.schema';
import { RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema as RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema } from './RolePrivilegeUncheckedCreateWithoutRoleInput.schema';
import { RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema as RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema } from './RolePrivilegeCreateOrConnectWithoutRoleInput.schema';
import { RolePrivilegeUpsertWithWhereUniqueWithoutRoleInputObjectSchema as RolePrivilegeUpsertWithWhereUniqueWithoutRoleInputObjectSchema } from './RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput.schema';
import { RolePrivilegeCreateManyRoleInputEnvelopeObjectSchema as RolePrivilegeCreateManyRoleInputEnvelopeObjectSchema } from './RolePrivilegeCreateManyRoleInputEnvelope.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeUpdateWithWhereUniqueWithoutRoleInputObjectSchema as RolePrivilegeUpdateWithWhereUniqueWithoutRoleInputObjectSchema } from './RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput.schema';
import { RolePrivilegeUpdateManyWithWhereWithoutRoleInputObjectSchema as RolePrivilegeUpdateManyWithWhereWithoutRoleInputObjectSchema } from './RolePrivilegeUpdateManyWithWhereWithoutRoleInput.schema';
import { RolePrivilegeScalarWhereInputObjectSchema as RolePrivilegeScalarWhereInputObjectSchema } from './RolePrivilegeScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RolePrivilegeCreateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => RolePrivilegeUpsertWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUpsertWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => RolePrivilegeCreateManyRoleInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema), z.lazy(() => RolePrivilegeWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => RolePrivilegeUpdateWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUpdateWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => RolePrivilegeUpdateManyWithWhereWithoutRoleInputObjectSchema), z.lazy(() => RolePrivilegeUpdateManyWithWhereWithoutRoleInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema), z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const RolePrivilegeUpdateManyWithoutRoleNestedInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateManyWithoutRoleNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateManyWithoutRoleNestedInput>;
export const RolePrivilegeUpdateManyWithoutRoleNestedInputObjectZodSchema = makeSchema();
