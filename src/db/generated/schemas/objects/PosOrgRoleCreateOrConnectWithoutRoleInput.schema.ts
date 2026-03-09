import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleCreateWithoutRoleInputObjectSchema as PosOrgRoleCreateWithoutRoleInputObjectSchema } from './PosOrgRoleCreateWithoutRoleInput.schema';
import { PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema as PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutRoleInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutRoleInputObjectSchema)])
}).strict();
export const PosOrgRoleCreateOrConnectWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleCreateOrConnectWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleCreateOrConnectWithoutRoleInput>;
export const PosOrgRoleCreateOrConnectWithoutRoleInputObjectZodSchema = makeSchema();
