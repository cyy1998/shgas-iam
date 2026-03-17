import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleCreateWithoutRoleInputObjectSchema as PosOrgRoleCreateWithoutRoleInputObjectSchema } from './PosOrgRoleCreateWithoutRoleInput.schema';
import { PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema as PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutRoleInput.schema';
import { PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema as PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema } from './PosOrgRoleCreateOrConnectWithoutRoleInput.schema';
import { PosOrgRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema as PosOrgRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema } from './PosOrgRoleUpsertWithWhereUniqueWithoutRoleInput.schema';
import { PosOrgRoleCreateManyRoleInputEnvelopeObjectSchema as PosOrgRoleCreateManyRoleInputEnvelopeObjectSchema } from './PosOrgRoleCreateManyRoleInputEnvelope.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema as PosOrgRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema } from './PosOrgRoleUpdateWithWhereUniqueWithoutRoleInput.schema';
import { PosOrgRoleUpdateManyWithWhereWithoutRoleInputObjectSchema as PosOrgRoleUpdateManyWithWhereWithoutRoleInputObjectSchema } from './PosOrgRoleUpdateManyWithWhereWithoutRoleInput.schema';
import { PosOrgRoleScalarWhereInputObjectSchema as PosOrgRoleScalarWhereInputObjectSchema } from './PosOrgRoleScalarWhereInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  upsert: z.union([z.lazy(() => PosOrgRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUpsertWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  set: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  disconnect: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  delete: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  connect: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional(),
  update: z.union([z.lazy(() => PosOrgRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUpdateWithWhereUniqueWithoutRoleInputObjectSchema).array()]).optional(),
  updateMany: z.union([z.lazy(() => PosOrgRoleUpdateManyWithWhereWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUpdateManyWithWhereWithoutRoleInputObjectSchema).array()]).optional(),
  deleteMany: z.union([z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema), z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgRoleUpdateManyWithoutRoleNestedInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateManyWithoutRoleNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateManyWithoutRoleNestedInput>;
export const PosOrgRoleUpdateManyWithoutRoleNestedInputObjectZodSchema = makeSchema();
