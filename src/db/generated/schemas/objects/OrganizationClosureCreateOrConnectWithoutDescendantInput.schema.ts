import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureCreateWithoutDescendantInputObjectSchema as OrganizationClosureCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureCreateWithoutDescendantInput.schema';
import { OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutDescendantInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema)])
}).strict();
export const OrganizationClosureCreateOrConnectWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateOrConnectWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateOrConnectWithoutDescendantInput>;
export const OrganizationClosureCreateOrConnectWithoutDescendantInputObjectZodSchema = makeSchema();
