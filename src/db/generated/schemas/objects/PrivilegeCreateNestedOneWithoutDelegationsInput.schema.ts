import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCreateWithoutDelegationsInputObjectSchema as PrivilegeCreateWithoutDelegationsInputObjectSchema } from './PrivilegeCreateWithoutDelegationsInput.schema';
import { PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema as PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema } from './PrivilegeUncheckedCreateWithoutDelegationsInput.schema';
import { PrivilegeCreateOrConnectWithoutDelegationsInputObjectSchema as PrivilegeCreateOrConnectWithoutDelegationsInputObjectSchema } from './PrivilegeCreateOrConnectWithoutDelegationsInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './PrivilegeWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeCreateWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PrivilegeCreateOrConnectWithoutDelegationsInputObjectSchema).optional(),
  connect: z.lazy(() => PrivilegeWhereUniqueInputObjectSchema).optional()
}).strict();
export const PrivilegeCreateNestedOneWithoutDelegationsInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateNestedOneWithoutDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateNestedOneWithoutDelegationsInput>;
export const PrivilegeCreateNestedOneWithoutDelegationsInputObjectZodSchema = makeSchema();
