import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureScalarWhereInputObjectSchema as OrganizationClosureScalarWhereInputObjectSchema } from './OrganizationClosureScalarWhereInput.schema';
import { OrganizationClosureUpdateManyMutationInputObjectSchema as OrganizationClosureUpdateManyMutationInputObjectSchema } from './OrganizationClosureUpdateManyMutationInput.schema';
import { OrganizationClosureUncheckedUpdateManyWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedUpdateManyWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedUpdateManyWithoutDescendantInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationClosureUpdateManyMutationInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedUpdateManyWithoutDescendantInputObjectSchema)])
}).strict();
export const OrganizationClosureUpdateManyWithWhereWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateManyWithWhereWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateManyWithWhereWithoutDescendantInput>;
export const OrganizationClosureUpdateManyWithWhereWithoutDescendantInputObjectZodSchema = makeSchema();
