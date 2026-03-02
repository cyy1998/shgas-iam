import { ClientManagementLevel } from '@constants/client.managementLevel';
import { ClientStatus } from '@constants/client.status';
import { z } from '@hono/zod-openapi';

export const ClientExtAttributesDtoSchema = z.object({
  userExcluding: z.array(z.string()).optional(),
  requireOrcas: z.boolean(),
  validRedirectUrls: z.array(z.string()),
  clientSecret: z.string(),
  managementLevel: z.enum(ClientManagementLevel).openapi({ example: "Independent" }),
  logoutEndpoint: z.url(),
  callbackEndpoint: z.url()
}).openapi('ClientExtAttributesDto');

export type ClientExtAttributesDto = z.infer<typeof ClientExtAttributesDtoSchema>;

export const ClientDtoSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  clientCode: z.string().openapi({ example: 'tender' }),
  clientName: z.string().openapi({ example: '采招系统' }),
  url: z.string().nullable().openapi({ example: '采招系统' }),
  status: z.enum(ClientStatus).openapi({ example: 1 }),
  extAttributes: ClientExtAttributesDtoSchema,
}).openapi('ClientDto');

export type ClientDto = z.infer<typeof ClientDtoSchema>;

export const ClientInputDtoSchema = ClientDtoSchema.partial().required({
  id: true,
  clientCode: true,
});

export type ClientInputDto = z.infer<typeof ClientInputDtoSchema>;

export const ClientVoSchema = z.object({
  clientId: z.number().openapi({ example: 1 }),
  clientCode: z.string().openapi({ example: 'tender' }),
  clientName: z.string().openapi({ example: '采招系统' }),
  status: z.enum(ClientStatus).openapi({ example: 1 }), // 或根据实际情况
  statusText: z.string().openapi({ example: '启用' }),
  extAttributes: z.record(z.string(), z.unknown()).nullable(),
}).openapi('ClientVo');

export type ClientVo = z.infer<typeof ClientVoSchema>;
