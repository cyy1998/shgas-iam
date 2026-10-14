import { expect, test } from "bun:test";
import { OrganizationSearchTransportRequestSchema } from "@api/services/organization-search/organization-search.schema";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { V3UserProfileSearchTransportRequestSchema } from "@iam/user-profile-read-model/v3";

test("both Filter transport entries generate independently named recursive OpenAPI components", () => {
  const app = new OpenAPIHono();
  for (const [path, schema] of [
    ["/organizations", OrganizationSearchTransportRequestSchema],
    ["/profiles", V3UserProfileSearchTransportRequestSchema],
  ] as const) {
    app.openapi(
      createRoute({
        method: "post",
        path,
        request: { body: { content: { "application/json": { schema } } } },
        responses: { 204: { description: "Accepted" } },
      }),
      (context) => context.body(null, 204),
    );
  }
  const document = app.getOpenAPIDocument({ openapi: "3.1.0", info: { title: "Filters", version: "1" } });
  const schemas = document.components?.schemas;
  expect(schemas).toBeDefined();
  for (const [requestName, expressionName, otherExpressionName] of [
    ["OrganizationSearchRequest", "OrganizationFilterExpression", "V3UserProfileFilterExpression"],
    ["V3UserProfileSearchRequest", "V3UserProfileFilterExpression", "OrganizationFilterExpression"],
  ] as const) {
    expect(schemas?.[requestName]).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: { filter: { $ref: `#/components/schemas/${expressionName}` } },
    });
    const expression = JSON.stringify(schemas?.[expressionName]);
    expect(schemas?.[expressionName]).toMatchObject({ anyOf: expect.any(Array) });
    expect(expression.match(/"\$ref"/g)).toHaveLength(4);
    expect(expression.match(new RegExp(`#/components/schemas/${expressionName}`, "g"))).toHaveLength(4);
    expect(expression).not.toContain(otherExpressionName);
  }
});
