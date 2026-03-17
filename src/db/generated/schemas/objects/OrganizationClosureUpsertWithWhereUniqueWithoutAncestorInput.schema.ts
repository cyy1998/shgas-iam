import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureUpdateWithoutAncestorInputObjectSchema as OrganizationClosureUpdateWithoutAncestorInputObjectSchema } from './OrganizationClosureUpdateWithoutAncestorInput.schema';
import { OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedUpdateWithoutAncestorInput.schema';
import { OrganizationClosureCreateWithoutAncestorInputObjectSchema as OrganizationClosureCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureCreateWithoutAncestorInput.schema';
import { OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedCreateWithoutAncestorInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationClosureWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => OrganizationClosureUpdateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationClosureCreateWithoutAncestorInputObjectSchema), z.lazy(() => OrganizationClosureUncheckedCreateWithoutAncestorInputObjectSchema)])
}).strict();
export const OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInput>;
export const OrganizationClosureUpsertWithWhereUniqueWithoutAncestorInputObjectZodSchema = makeSchema();
