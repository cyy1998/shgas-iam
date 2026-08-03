import { z } from "@hono/zod-openapi";

// Runtime adapters retain the existing 400/401 error mapping. The schemas
// therefore accept absent headers during route validation while OpenAPI
// records which headers are required by the wire protocol.
const TransportClientCodeHeaderSchema = z.string().optional().openapi({
  example: "portal",
  param: {
    description:
      "Required encoded Client Code used to select client-scoped authentication and projection.",
    required: true,
  },
});

export const CustomSsoDeliveryRequestHeadersSchema = z.object({
  Client: TransportClientCodeHeaderSchema,
});

export const GatewayAuthzRequestHeadersSchema
  = CustomSsoDeliveryRequestHeadersSchema.extend({
    "X-Forwarded-Uri": z.string().optional().openapi({
      example: "/orders/123",
      param: {
        description:
          "Required original request URI supplied by the trusted gateway.",
        required: true,
      },
    }),
  });
