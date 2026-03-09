import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleCreateWithoutPosOrgInputObjectSchema as PosOrgRoleCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateWithoutPosOrgInput.schema';
import { PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutPosOrgInput.schema';
import { PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema as PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateOrConnectWithoutPosOrgInput.schema';
import { PosOrgRoleCreateManyPosOrgInputEnvelopeObjectSchema as PosOrgRoleCreateManyPosOrgInputEnvelopeObjectSchema } from './PosOrgRoleCreateManyPosOrgInputEnvelope.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleCreateWithoutPosOrgInputObjectSchema).array(), z.lazy(() => PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgRoleCreateManyPosOrgInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateNestedManyWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateNestedManyWithoutPosOrgInput>;
export const PosOrgRoleCreateNestedManyWithoutPosOrgInputObjectZodSchema = makeSchema();
