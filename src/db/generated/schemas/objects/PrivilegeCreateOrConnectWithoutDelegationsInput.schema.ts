import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './PrivilegeWhereUniqueInput.schema';
import { PrivilegeCreateWithoutDelegationsInputObjectSchema as PrivilegeCreateWithoutDelegationsInputObjectSchema } from './PrivilegeCreateWithoutDelegationsInput.schema';
import { PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema as PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema } from './PrivilegeUncheckedCreateWithoutDelegationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => PrivilegeCreateWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema)])
}).strict();
export const PrivilegeCreateOrConnectWithoutDelegationsInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateOrConnectWithoutDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateOrConnectWithoutDelegationsInput>;
export const PrivilegeCreateOrConnectWithoutDelegationsInputObjectZodSchema = makeSchema();
