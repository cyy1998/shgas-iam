import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutClientInputObjectSchema as RoleCreateWithoutClientInputObjectSchema } from './RoleCreateWithoutClientInput.schema';
import { RoleUncheckedCreateWithoutClientInputObjectSchema as RoleUncheckedCreateWithoutClientInputObjectSchema } from './RoleUncheckedCreateWithoutClientInput.schema';
import { RoleCreateOrConnectWithoutClientInputObjectSchema as RoleCreateOrConnectWithoutClientInputObjectSchema } from './RoleCreateOrConnectWithoutClientInput.schema';
import { RoleUpsertWithWhereUniqueWithoutClientInputObjectSchema as RoleUpsertWithWhereUniqueWithoutClientInputObjectSchema } from './RoleUpsertWithWhereUniqueWithoutClientInput.schema';
import { RoleCreateManyClientInputEnvelopeObjectSchema as RoleCreateManyClientInputEnvelopeObjectSchema } from './RoleCreateManyClientInputEnvelope.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateWithWhereUniqueWithoutClientInputObjectSchema as RoleUpdateWithWhereUniqueWithoutClientInputObjectSchema } from './RoleUpdateWithWhereUniqueWithoutClientInput.schema';
import { RoleUpdateManyWithWhereWithoutClientInputObjectSchema as RoleUpdateManyWithWhereWithoutClientInputObjectSchema } from './RoleUpdateManyWithWhereWithoutClientInput.schema';
import { RoleScalarWhereInputObjectSchema as RoleScalarWhereInputObjectSchema } from './RoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutClientInputObjectSchema), z.lazy(() => RoleCreateWithoutClientInputObjectSchema).array(), z.lazy(() => RoleUncheckedCreateWithoutClientInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutClientInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => RoleCreateOrConnectWithoutClientInputObjectSchema), z.lazy(() => RoleCreateOrConnectWithoutClientInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => RoleUpsertWithWhereUniqueWithoutClientInputObjectSchema), z.lazy(() => RoleUpsertWithWhereUniqueWithoutClientInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => RoleCreateManyClientInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => RoleWhereUniqueInputObjectSchema), z.lazy(() => RoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => RoleWhereUniqueInputObjectSchema), z.lazy(() => RoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => RoleWhereUniqueInputObjectSchema), z.lazy(() => RoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => RoleWhereUniqueInputObjectSchema), z.lazy(() => RoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => RoleUpdateWithWhereUniqueWithoutClientInputObjectSchema), z.lazy(() => RoleUpdateWithWhereUniqueWithoutClientInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => RoleUpdateManyWithWhereWithoutClientInputObjectSchema), z.lazy(() => RoleUpdateManyWithWhereWithoutClientInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => RoleScalarWhereInputObjectSchema), z.lazy(() => RoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const RoleUpdateManyWithoutClientNestedInputObjectSchema: z.ZodType<Prisma.RoleUpdateManyWithoutClientNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateManyWithoutClientNestedInput>;
export const RoleUpdateManyWithoutClientNestedInputObjectZodSchema = makeSchema();
