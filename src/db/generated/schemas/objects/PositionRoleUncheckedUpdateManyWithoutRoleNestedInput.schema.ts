import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateWithoutRoleInputObjectSchema as PositionRoleCreateWithoutRoleInputObjectSchema } from './PositionRoleCreateWithoutRoleInput.schema';
import { PositionRoleUncheckedCreateWithoutRoleInputObjectSchema as PositionRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PositionRoleUncheckedCreateWithoutRoleInput.schema';
import { PositionRoleCreateOrConnectWithoutRoleInputObjectSchema as PositionRoleCreateOrConnectWithoutRoleInputObjectSchema } from './PositionRoleCreateOrConnectWithoutRoleInput.schema';
import { PositionRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema as PositionRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema } from './PositionRoleUpsertWithWhereUniqueWithoutRoleInput.schema';
import { PositionRoleCreateManyRoleInputEnvelopeObjectSchema as PositionRoleCreateManyRoleInputEnvelopeObjectSchema } from './PositionRoleCreateManyRoleInputEnvelope.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema';
import { PositionRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema as PositionRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema } from './PositionRoleUpdateWithWhereUniqueWithoutRoleInput.schema';
import { PositionRoleUpdateManyWithWhereWithoutRoleInputObjectSchema as PositionRoleUpdateManyWithWhereWithoutRoleInputObjectSchema } from './PositionRoleUpdateManyWithWhereWithoutRoleInput.schema';
import { PositionRoleScalarWhereInputObjectSchema as PositionRoleScalarWhereInputObjectSchema } from './PositionRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => PositionRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PositionRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PositionRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PositionRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PositionRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PositionRoleUpdateManyWithWhereWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUpdateManyWithWhereWithoutRoleInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PositionRoleScalarWhereInputObjectSchema), z.lazy(() => PositionRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PositionRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedUpdateManyWithoutRoleNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedUpdateManyWithoutRoleNestedInput>;
export const PositionRoleUncheckedUpdateManyWithoutRoleNestedInputObjectZodSchema = makeSchema();
