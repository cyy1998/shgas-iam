import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgRoleScalarWhereInputObjectSchema as PosOrgRoleScalarWhereInputObjectSchema } from './PosOrgRoleScalarWhereInput.schema';
import { PosOrgRoleUpdateManyMutationInputObjectSchema as PosOrgRoleUpdateManyMutationInputObjectSchema } from './PosOrgRoleUpdateManyMutationInput.schema';
import { PosOrgRoleUncheckedUpdateManyWithoutRoleInputObjectSchema as PosOrgRoleUncheckedUpdateManyWithoutRoleInputObjectSchema } from './PosOrgRoleUncheckedUpdateManyWithoutRoleInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PosOrgRoleScalarWhereInputObjectSchema),
  data: z.union([z.lazy(() => PosOrgRoleUpdateManyMutationInputObjectSchema), z.lazy(() => PosOrgRoleUncheckedUpdateManyWithoutRoleInputObjectSchema)])
}).strict();
export const PosOrgRoleUpdateManyWithWhereWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateManyWithWhereWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateManyWithWhereWithoutRoleInput>;
export const PosOrgRoleUpdateManyWithWhereWithoutRoleInputObjectZodSchema = makeSchema();
