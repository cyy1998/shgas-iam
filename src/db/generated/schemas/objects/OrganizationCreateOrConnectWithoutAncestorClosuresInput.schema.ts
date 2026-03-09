import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutAncestorClosuresInputObjectSchema as OrganizationCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateWithoutAncestorClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutAncestorClosuresInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutAncestorClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutAncestorClosuresInput>;
export const OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectZodSchema = makeSchema();
