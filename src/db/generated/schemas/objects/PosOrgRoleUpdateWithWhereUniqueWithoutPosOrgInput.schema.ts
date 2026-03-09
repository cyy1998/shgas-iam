import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleUpdateWithoutPosOrgInputObjectSchema as PosOrgRoleUpdateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUpdateWithoutPosOrgInput.schema';
import { PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedUpdateWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgRoleUpdateWithoutPosOrgInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectSchema)])
}).strict();
export const PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInput>;
export const PosOrgRoleUpdateWithWhereUniqueWithoutPosOrgInputObjectZodSchema = makeSchema();
