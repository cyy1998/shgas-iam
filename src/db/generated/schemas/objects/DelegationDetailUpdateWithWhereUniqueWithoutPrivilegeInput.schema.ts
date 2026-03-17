import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailUpdateWithoutPrivilegeInputObjectSchema as DelegationDetailUpdateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUpdateWithoutPrivilegeInput.schema';
import { DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedUpdateWithoutPrivilegeInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereUniqueInputObjectSchema),
  data: z.union([z.lazy(() => DelegationDetailUpdateWithoutPrivilegeInputObjectSchema), z.lazy(() => DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectSchema)])
}).strict();
export const DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInput>;
export const DelegationDetailUpdateWithWhereUniqueWithoutPrivilegeInputObjectZodSchema = makeSchema();
