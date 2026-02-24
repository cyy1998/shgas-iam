import { z } from '@hono/zod-openapi';

export const DelegationAbstractDtoSchema = z.object({
  delegatorId: z.number().openapi({ example: 1 }),
  delegatorUsername: z.string().openapi({ example: '138550' }),
  delegateeId: z.number().openapi({ example: 1 }),
  delegateeUsername: z.string().openapi({ example: '138550' }),
  privilegeId: z.number().openapi({ example: 1 }),
  privilegeCode: z.string().openapi({ example: 'ui:menu:tender:home' }),
}).openapi('DelegationAbstractDto');

export type DelegationAbstractDto = z.infer<typeof DelegationAbstractDtoSchema>;
