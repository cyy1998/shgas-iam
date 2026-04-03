import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleFindManySchema as RoleFindManySchema } from '../findManyRole.schema';
import { ClientCountOutputTypeArgsObjectSchema as ClientCountOutputTypeArgsObjectSchema } from './ClientCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  clientCode: z.boolean().optional(),
  clientName: z.boolean().optional(),
  clientSecret: z.boolean().optional(),
  url: z.boolean().optional(),
  status: z.boolean().optional(),
  description: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  extAttributes: z.boolean().optional(),
  roles: z.union([z.boolean(), z.lazy(() => RoleFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => ClientCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const ClientSelectObjectSchema: z.ZodType<Prisma.ClientSelect> = makeSchema() as unknown as z.ZodType<Prisma.ClientSelect>;
export const ClientSelectObjectZodSchema = makeSchema();
