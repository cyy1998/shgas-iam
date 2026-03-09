import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateWithoutPositionInputObjectSchema as PositionRoleCreateWithoutPositionInputObjectSchema } from './PositionRoleCreateWithoutPositionInput.schema';
import { PositionRoleUncheckedCreateWithoutPositionInputObjectSchema as PositionRoleUncheckedCreateWithoutPositionInputObjectSchema } from './PositionRoleUncheckedCreateWithoutPositionInput.schema';
import { PositionRoleCreateOrConnectWithoutPositionInputObjectSchema as PositionRoleCreateOrConnectWithoutPositionInputObjectSchema } from './PositionRoleCreateOrConnectWithoutPositionInput.schema';
import { PositionRoleUpsertWithWhereUniqueWithoutPositionInputObjectSchema as PositionRoleUpsertWithWhereUniqueWithoutPositionInputObjectSchema } from './PositionRoleUpsertWithWhereUniqueWithoutPositionInput.schema';
import { PositionRoleCreateManyPositionInputEnvelopeObjectSchema as PositionRoleCreateManyPositionInputEnvelopeObjectSchema } from './PositionRoleCreateManyPositionInputEnvelope.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleUpdateWithWhereUniqueWithoutPositionInputObjectSchema as PositionRoleUpdateWithWhereUniqueWithoutPositionInputObjectSchema } from './PositionRoleUpdateWithWhereUniqueWithoutPositionInput.schema';
import { PositionRoleUpdateManyWithWhereWithoutPositionInputObjectSchema as PositionRoleUpdateManyWithWhereWithoutPositionInputObjectSchema } from './PositionRoleUpdateManyWithWhereWithoutPositionInput.schema';
import { PositionRoleScalarWhereInputObjectSchema as PositionRoleScalarWhereInputObjectSchema } from './PositionRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionRoleCreateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleCreateWithoutPositionInputObjectSchema).array(), z.lazy(() => PositionRoleUncheckedCreateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutPositionInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PositionRoleCreateOrConnectWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleCreateOrConnectWithoutPositionInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PositionRoleUpsertWithWhereUniqueWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUpsertWithWhereUniqueWithoutPositionInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PositionRoleCreateManyPositionInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PositionRoleUpdateWithWhereUniqueWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUpdateWithWhereUniqueWithoutPositionInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PositionRoleUpdateManyWithWhereWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUpdateManyWithWhereWithoutPositionInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PositionRoleScalarWhereInputObjectSchema), z.lazy(() => PositionRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PositionRoleUpdateManyWithoutPositionNestedInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateManyWithoutPositionNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateManyWithoutPositionNestedInput>;
export const PositionRoleUpdateManyWithoutPositionNestedInputObjectZodSchema = makeSchema();
