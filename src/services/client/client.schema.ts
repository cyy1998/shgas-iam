import { ClientManagementLevel } from '@enums/client.managementLevel';
// import { Status } from '@enums/status';
import { z } from '@hono/zod-openapi';
import { ClientSchema } from '@/db/generated/schemas';

export const ClientExtAttributesDtoSchema = z.object({
  userExcluding: z.array(z.string()).optional(),
  requireOrcas: z.boolean(),
  validRedirectUrls: z.array(z.string()),
  clientSecret: z.string(),
  managementLevel: z.enum(ClientManagementLevel).openapi({ example: 'Independent' }),
  logoutEndpoint: z.url(),
  callbackEndpoint: z.url(),
}).openapi('ClientExtAttributesDto');

export const ClientDtoSchema = ClientSchema.extend({
  extAttributes: ClientExtAttributesDtoSchema,
});

export const ClientInputDtoSchema = ClientDtoSchema.partial().required({
  id: true,
});

// export const ClientVoSchema = z.object({
//   clientId: z.number().openapi({ example: 1 }),
//   clientCode: z.string().openapi({ example: 'tender' }),
//   clientName: z.string().openapi({ example: '采招系统' }),
//   status: z.enum(Status).openapi({ example: 1 }), // 或根据实际情况
//   statusText: z.string().openapi({ example: '启用' }),
//   extAttributes: z.record(z.string(), z.unknown()).nullable(),
// }).openapi('ClientVo');

// export type ClientVo = z.infer<typeof ClientVoSchema>;
