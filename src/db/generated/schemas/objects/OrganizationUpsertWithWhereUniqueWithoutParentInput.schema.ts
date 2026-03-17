import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateWithoutParentInputObjectSchema as OrganizationUpdateWithoutParentInputObjectSchema } from './OrganizationUpdateWithoutParentInput.schema';
import { OrganizationUncheckedUpdateWithoutParentInputObjectSchema as OrganizationUncheckedUpdateWithoutParentInputObjectSchema } from './OrganizationUncheckedUpdateWithoutParentInput.schema';
import { OrganizationCreateWithoutParentInputObjectSchema as OrganizationCreateWithoutParentInputObjectSchema } from './OrganizationCreateWithoutParentInput.schema';
import { OrganizationUncheckedCreateWithoutParentInputObjectSchema as OrganizationUncheckedCreateWithoutParentInputObjectSchema } from './OrganizationUncheckedCreateWithoutParentInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => OrganizationUpdateWithoutParentInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutParentInputObjectSchema)]),
  create: z.union([z.lazy(() => OrganizationCreateWithoutParentInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutParentInputObjectSchema)])
}).strict();
export const OrganizationUpsertWithWhereUniqueWithoutParentInputObjectSchema: z.ZodType<Prisma.OrganizationUpsertWithWhereUniqueWithoutParentInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpsertWithWhereUniqueWithoutParentInput>;
export const OrganizationUpsertWithWhereUniqueWithoutParentInputObjectZodSchema = makeSchema();
