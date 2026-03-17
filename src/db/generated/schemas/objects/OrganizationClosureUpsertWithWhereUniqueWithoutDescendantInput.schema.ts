import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureUpdateWithoutDescendantInputObjectSchema as OrganizationClosureUpdateWithoutDescendantInputObjectSchema } from './OrganizationClosureUpdateWithoutDescendantInput.schema';
import { OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedUpdateWithoutDescendantInput.schema';
import { OrganizationClosureCreateWithoutDescendantInputObjectSchema as OrganizationClosureCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureCreateWithoutDescendantInput.schema';
import { OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutDescendantInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => OrganizationClosureUpdateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutDescendantInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutDescendantInputObjectSchema)])
}).strict();
export const OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInput>;
export const OrganizationClosureUpsertWithWhereUniqueWithoutDescendantInputObjectZodSchema = makeSchema();
