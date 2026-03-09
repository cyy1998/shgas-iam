import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleCreateWithoutPosOrgInputObjectSchema as PosOrgRoleCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateWithoutPosOrgInput.schema';
import { PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema)])
}).strict();
export const PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateOrConnectWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateOrConnectWithoutPosOrgInput>;
export const PosOrgRoleCreateOrConnectWithoutPosOrgInputObjectZodSchema = makeSchema();
