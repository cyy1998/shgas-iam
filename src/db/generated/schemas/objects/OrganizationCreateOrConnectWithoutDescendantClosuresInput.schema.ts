import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutDescendantClosuresInputObjectSchema as OrganizationCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateWithoutDescendantClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutDescendantClosuresInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutDescendantClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutDescendantClosuresInput>;
export const OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectZodSchema = makeSchema();
