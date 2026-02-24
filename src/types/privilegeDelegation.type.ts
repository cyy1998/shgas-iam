import { z } from '@hono/zod-openapi';

export const PrivilegeDelegationDtoSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  delegatorUserId: z.number().openapi({ example: 1 }),
  delegatorUsername: z.string().openapi({ example: '138550' }),
  delegatorName: z.string().openapi({ example: '蔡奕阳' }),
  delegateeUserId: z.number().openapi({ example: 1 }),
  delegateeUsername: z.string().openapi({ example: '138550' }),
  delegateeName: z.string().openapi({ example: '蔡奕阳' }),
}).openapi('PrivilegeDelegationDto');

export type PrivilegeDelegationDto = z.infer<typeof PrivilegeDelegationDtoSchema>;
