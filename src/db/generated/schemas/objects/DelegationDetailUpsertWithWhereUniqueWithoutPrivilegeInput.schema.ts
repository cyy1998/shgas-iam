import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailUpdateWithoutPrivilegeInputObjectSchema as DelegationDetailUpdateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUpdateWithoutPrivilegeInput.schema';
import { DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedUpdateWithoutPrivilegeInput.schema';
import { DelegationDetailCreateWithoutPrivilegeInputObjectSchema as DelegationDetailCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailCreateWithoutPrivilegeInput.schema';
import { DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedCreateWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema),
  update: z.union([z.lazy(() => DelegationDetailUpdateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectSchema)]),
  create: z.union([z.lazy(() => DelegationDetailCreateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUncheckedCreateWithoutPrivilegeInputObjectSchema)])
}).strict();
export const DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInput>;
export const DelegationDetailUpsertWithWhereUniqueWithoutPrivilegeInputObjectZodSchema = makeSchema();
