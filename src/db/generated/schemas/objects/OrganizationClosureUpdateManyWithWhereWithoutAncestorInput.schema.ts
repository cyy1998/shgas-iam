import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureScalarWhereInputObjectSchema as OrganizationClosureScalarWhereInputObjectSchema } from './OrganizationClosureScalarWhereInput.schema';
import { OrganizationClosureUpdateManyMutationInputObjectSchema as OrganizationClosureUpdateManyMutationInputObjectSchema } from './OrganizationClosureUpdateManyMutationInput.schema';
import { OrganizationClosureUncheckedUpdateManyWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedUpdateManyWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedUpdateManyWithoutAncestorInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationClosureUpdateManyMutationInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedUpdateManyWithoutAncestorInputObjectSchema)])
}).strict();
export const OrganizationClosureUpdateManyWithWhereWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateManyWithWhereWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateManyWithWhereWithoutAncestorInput>;
export const OrganizationClosureUpdateManyWithWhereWithoutAncestorInputObjectZodSchema = makeSchema();
