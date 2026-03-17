import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureUpdateWithoutAncestorInputObjectSchema as OrganizationClosureUpdateWithoutAncestorInputObjectSchema } from './OrganizationClosureUpdateWithoutAncestorInput.schema';
import { OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedUpdateWithoutAncestorInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => OrganizationClosureUpdateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectSchema)])
}).strict();
export const OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInput>;
export const OrganizationClosureUpdateWithWhereUniqueWithoutAncestorInputObjectZodSchema = makeSchema();
