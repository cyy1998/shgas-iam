import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureUpdateWithoutDescendantInputObjectSchema as OrganizationClosureUpdateWithoutDescendantInputObjectSchema } from './OrganizationClosureUpdateWithoutDescendantInput.schema';
import { OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedUpdateWithoutDescendantInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationClosureUpdateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectSchema)])
}).strict();
export const OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInput>;
export const OrganizationClosureUpdateWithWhereUniqueWithoutDescendantInputObjectZodSchema = makeSchema();
