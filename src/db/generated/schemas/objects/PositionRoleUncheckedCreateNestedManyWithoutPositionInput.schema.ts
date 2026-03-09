import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionRoleCreateWithoutPositionInputObjectSchema as PositionRoleCreateWithoutPositionInputObjectSchema } from './PositionRoleCreateWithoutPositionInput.schema';
import { PositionRoleUncheckedCreateWithoutPositionInputObjectSchema as PositionRoleUncheckedCreateWithoutPositionInputObjectSchema } from './PositionRoleUncheckedCreateWithoutPositionInput.schema';
import { PositionRoleCreateOrConnectWithoutPositionInputObjectSchema as PositionRoleCreateOrConnectWithoutPositionInputObjectSchema } from './PositionRoleCreateOrConnectWithoutPositionInput.schema';
import { PositionRoleCreateManyPositionInputEnvelopeObjectSchema as PositionRoleCreateManyPositionInputEnvelopeObjectSchema } from './PositionRoleCreateManyPositionInputEnvelope.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './PositionRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PositionRoleCreateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleCreateWithoutPositionInputObjectSchema).array(), z.lazy(() => PositionRoleUncheckedCreateWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleUncheckedCreateWithoutPositionInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PositionRoleCreateOrConnectWithoutPositionInputObjectSchema), z.lazy(() => PositionRoleCreateOrConnectWithoutPositionInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PositionRoleCreateManyPositionInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PositionRoleWhereUniqueInputObjectSchema), z.lazy(() => PositionRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedCreateNestedManyWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedCreateNestedManyWithoutPositionInput>;
export const PositionRoleUncheckedCreateNestedManyWithoutPositionInputObjectZodSchema = makeSchema();
