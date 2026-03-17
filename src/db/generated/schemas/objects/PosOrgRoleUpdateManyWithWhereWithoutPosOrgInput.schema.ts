import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleScalarWhereInputObjectSchema as PosOrgRoleScalarWhereInputObjectSchema } from './PosOrgRoleScalarWhereInput.schema';
import { PosOrgRoleUpdateManyMutationInputObjectSchema as PosOrgRoleUpdateManyMutationInputObjectSchema } from './PosOrgRoleUpdateManyMutationInput.schema';
import { PosOrgRoleUncheckedUpdateManyWithoutPosOrgInputObjectSchema as PosOrgRoleUncheckedUpdateManyWithoutPosOrgInputObjectSchema } from './PosOrgRoleUncheckedUpdateManyWithoutPosOrgInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgRoleUpdateManyMutationInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedUpdateManyWithoutPosOrgInputObjectSchema)])
}).strict();
export const PosOrgRoleUpdateManyWithWhereWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateManyWithWhereWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateManyWithWhereWithoutPosOrgInput>;
export const PosOrgRoleUpdateManyWithWhereWithoutPosOrgInputObjectZodSchema = makeSchema();
