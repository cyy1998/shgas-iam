import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleUpdateWithoutPosOrgInputObjectSchema as PosOrgRoleUpdateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUpdateWithoutPosOrgInput.schema';
import { PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedUpdateWithoutPosOrgInput.schema';
import { PosOrgRoleCreateWithoutPosOrgInputObjectSchema as PosOrgRoleCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleCreateWithoutPosOrgInput.schema';
import { PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedCreateWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => PosOrgRoleUpdateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectSchema)]),
  create: z.union([z.lazy(() => PosOrgRoleCreateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedCreateWithoutPosOrgInputObjectSchema)])
}).strict();
export const PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInput>;
export const PosOrgRoleUpsertWithWhereUniqueWithoutPosOrgInputObjectZodSchema = makeSchema();
