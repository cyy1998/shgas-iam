import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleCreateWithoutPosOrgInputObjectSchema as PosOrgRoleCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateWithoutPosOrgInput.schema';
import { PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutPosOrgInput.schema';
import { PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema as PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateOrConnectWithoutPosOrgInput.schema';
import { PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema as PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema } from './PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInput.schema';
import { PosOrgRoleCreateManyPosOrgInputEnvelopeObjectSchema as PosOrgRoleCreateManyPosOrgInputEnvelopeObjectSchema } from './PosOrgRoleCreateManyPosOrgInputEnvelope.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema as PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema } from './PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInput.schema';
import { PosOrgRoleUpdateManyWithWhereWithoutPosOrgInputObjectSchema as PosOrgRoleUpdateManyWithWhereWithoutPosOrgInputObjectSchema } from './PosOrgRoleUpdateManyWithWhereWithoutPosOrgInput.schema';
import { PosOrgRoleScalarWhereInputObjectSchema as PosOrgRoleScalarWhereInputObjectSchema } from './PosOrgRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleCreateWithoutPosOrgInputObjectSchema).array(), z.lazy(() => PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgRoleCreateManyPosOrgInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PosOrgRoleUpdateManyWithWhereWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUpdateManyWithWhereWithoutPosOrgInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema), z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgRoleUpdateManyWithoutPosOrgNestedInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateManyWithoutPosOrgNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateManyWithoutPosOrgNestedInput>;
export const PosOrgRoleUpdateManyWithoutPosOrgNestedInputObjectZodSchema = makeSchema();
