import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureCreateWithoutAncestorInputObjectSchema as OrganizationClosureCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureCreateWithoutAncestorInput.schema';
import { OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutAncestorInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema)])
}).strict();
export const OrganizationClosureCreateOrConnectWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCreateOrConnectWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCreateOrConnectWithoutAncestorInput>;
export const OrganizationClosureCreateOrConnectWithoutAncestorInputObjectZodSchema = makeSchema();
