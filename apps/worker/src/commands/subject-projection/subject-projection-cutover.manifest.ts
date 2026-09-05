import { ClientCodeSchema, CustomSsoClientMode } from "@iam/contracts";
import { customSsoClientConfigSchema } from "@iam/db/schema";
import { validateRedirectUrlPattern } from "@iam/domain/client";
import { z } from "zod";

const SecretDeliverySchema = z.object({
  status: z.enum(["pending", "confirmed", "not-required"]),
}).strict();

export const SubjectProjectionCutoverClientManifestSchema = z.object({
  clientCode: ClientCodeSchema,
  targetEnabled: z.boolean(),
  config: customSsoClientConfigSchema,
  secretDelivery: SecretDeliverySchema,
}).strict().superRefine((client, context) => {
  client.config.validRedirectUrls.forEach((pattern, index) => {
    const result = validateRedirectUrlPattern(pattern);
    if (!result.ok) {
      context.addIssue({
        code: "custom",
        path: ["config", "validRedirectUrls", index],
        message: result.error ?? "Invalid redirect URL pattern",
      });
    }
  });

  const expectedStatus = client.config.mode === CustomSsoClientMode.Gateway
    ? "not-required"
    : undefined;
  if (
    (expectedStatus !== undefined && client.secretDelivery.status !== expectedStatus)
    || (
      client.config.mode === CustomSsoClientMode.Independent
      && client.secretDelivery.status === "not-required"
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["secretDelivery", "status"],
      message: client.config.mode === CustomSsoClientMode.Gateway
        ? "Gateway client 不需要 Secret 交付确认"
        : "Independent client 必须显式记录 Secret 交付状态",
    });
  }
});

export const SubjectProjectionCutoverManifestSchema = z.object({
  version: z.literal(1),
  cutoverId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  clients: z.array(SubjectProjectionCutoverClientManifestSchema),
}).strict().superRefine((manifest, context) => {
  const seen = new Set<string>();
  manifest.clients.forEach((client, index) => {
    if (seen.has(client.clientCode)) {
      context.addIssue({
        code: "custom",
        path: ["clients", index, "clientCode"],
        message: "Cutover manifest 不得重复声明 client",
      });
    }
    seen.add(client.clientCode);
  });
});

export type SubjectProjectionCutoverManifest = z.infer<
  typeof SubjectProjectionCutoverManifestSchema
>;
