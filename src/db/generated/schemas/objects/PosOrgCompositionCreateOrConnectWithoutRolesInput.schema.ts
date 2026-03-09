import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionCreateWithoutRolesInputObjectSchema as PosOrgCompositionCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionCreateWithoutRolesInput.schema';
import { PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema as PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema } from './PosOrgCompositionUncheckedCreateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgCompositionWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PosOrgCompositionCreateWithoutRolesInputObjectSchema), z.lazy(() => PosOrgCompositionUncheckedCreateWithoutRolesInputObjectSchema)])
}).strict();
export const PosOrgCompositionCreateOrConnectWithoutRolesInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCreateOrConnectWithoutRolesInput>;
export const PosOrgCompositionCreateOrConnectWithoutRolesInputObjectZodSchema = makeSchema();
