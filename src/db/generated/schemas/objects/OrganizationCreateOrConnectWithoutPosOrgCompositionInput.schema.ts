import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateWithoutPosOrgCompositionInput.schema';
import { OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUncheckedCreateWithoutPosOrgCompositionInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutPosOrgCompositionInput>;
export const OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
