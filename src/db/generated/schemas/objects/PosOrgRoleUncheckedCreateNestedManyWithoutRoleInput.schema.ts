import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleCreateWithoutRoleInputObjectSchema as PosOrgRoleCreateWithoutRoleInputObjectSchema } from './PosOrgRoleCreateWithoutRoleInput.schema';
import { PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema as PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutRoleInput.schema';
import { PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema as PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema } from './PosOrgRoleCreateOrConnectWithoutRoleInput.schema';
import { PosOrgRoleCreateManyRoleInputEnvelopeObjectSchema as PosOrgRoleCreateManyRoleInputEnvelopeObjectSchema } from './PosOrgRoleCreateManyRoleInputEnvelope.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleCreateWithoutRoleInputObjectSchema).array(), z.lazy(() => PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema).array()]).optional(),
  connectOrCreate: z.union([z.lazy(() => PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema).array()]).optional(),
  createMany: z.lazy(() => PosOrgRoleCreateManyRoleInputEnvelopeObjectSchema).optional(),
  connect: z.union([z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema), z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema).array()]).optional()
}).strict();
export const PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUncheckedCreateNestedManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUncheckedCreateNestedManyWithoutRoleInput>;
export const PosOrgRoleUncheckedCreateNestedManyWithoutRoleInputObjectZodSchema = makeSchema();
