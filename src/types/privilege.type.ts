import { z } from '@hono/zod-openapi';

export const PrivilegeDtoSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  privCode: z.string().openapi({ example: 'ui:menu:tender:home' }),
  privName: z.string().openapi({ example: '采招门户' }),
}).openapi('PrivilegeDto');

export type PrivilegeDto = z.infer<typeof PrivilegeDtoSchema>;
