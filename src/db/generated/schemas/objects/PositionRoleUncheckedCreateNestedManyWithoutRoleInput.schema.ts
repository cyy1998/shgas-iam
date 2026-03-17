import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateWithoutRoleInputObjectSchema as PositionRoleCreateWithoutRoleInputObjectSchema } from './PositionRoleCreateWithoutRoleInput.schema';
import { PositionRoleUncheckedCreateWithoutRoleInputObjectSchema as PositionRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PositionRoleUncheckedCreateWithoutRoleInput.schema';
import { PositionRoleCreateOrConnectWithoutRoleInputObjectSchema as PositionRoleCreateOrConnectWithoutRoleInputObjectSchema } from './PositionRoleCreateOrConnectWithoutRoleInput.schema';
import { PositionRoleCreateManyRoleInputEnvelopeObjectSchema as PositionRoleCreateManyRoleInputEnvelopeObjectSchema } from './PositionRoleCreateManyRoleInputEnvelope.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => PositionRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PositionRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => PositionRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PositionRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedCreateNestedManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedCreateNestedManyWithoutRoleInput>;
export const PositionRoleUncheckedCreateNestedManyWithoutRoleInputObjectZodSchema = makeSchema();
