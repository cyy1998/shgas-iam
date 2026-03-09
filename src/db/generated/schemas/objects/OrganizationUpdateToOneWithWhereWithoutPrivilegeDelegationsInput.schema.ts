import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUpdateWithoutPrivilegeDelegationsInput.schema';
import { OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema as OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => OrganizationUpdateWithoutPrivilegeDelegationsInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutPrivilegeDelegationsInputObjectSchema)])
}).strict();
export const OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInput>;
export const OrganizationUpdateToOneWithWhereWithoutPrivilegeDelegationsInputObjectZodSchema = makeSchema();
