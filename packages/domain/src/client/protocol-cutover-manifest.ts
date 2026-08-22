import { z } from "zod";

const ClientProtocolCutoverTargetSchema = z.object({
  expectedEpoch: z.number().int().nonnegative(),
  ownerStatus: z.enum(["pending", "confirmed"]),
}).strict();

const CustomSsoClientProtocolCutoverTargetSchema = z.object({
  expectedEpoch: z.number().int().nonnegative(),
  ownerStatus: z.enum(["pending", "confirmed"]),
  targetCatalogVersion: z.literal(2),
}).strict();

const ClientProtocolCutoverManifestEntrySchema = z.object({
  clientCode: z.string().min(1).max(64),
  customSso: CustomSsoClientProtocolCutoverTargetSchema.nullable(),
  oidc: ClientProtocolCutoverTargetSchema.nullable(),
}).strict().refine(
  value => value.customSso !== null || value.oidc !== null,
  { message: "cutover manifest client must own at least one configured protocol" },
);

export const ClientProtocolCutoverManifestSchema = z.object({
  version: z.literal(2),
  clients: z.array(ClientProtocolCutoverManifestEntrySchema).min(1),
}).strict().superRefine((manifest, ctx) => {
  const seen = new Set<string>();
  for (const [index, client] of manifest.clients.entries()) {
    if (seen.has(client.clientCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["clients", index, "clientCode"],
        message: "cutover manifest clientCode must be unique",
      });
    }
    seen.add(client.clientCode);
  }
});

export type ClientProtocolCutoverManifest = z.infer<
  typeof ClientProtocolCutoverManifestSchema
>;

export interface ClientProtocolCutoverTarget {
  clientCode: string;
  protocol: "custom-sso" | "oidc";
  expectedEpoch: number;
  ownerConfirmed: boolean;
  targetCatalogVersion?: 2;
}

export function clientProtocolCutoverTargets(
  manifest: ClientProtocolCutoverManifest,
): ClientProtocolCutoverTarget[] {
  return manifest.clients.flatMap(client => ([
    ...(client.customSso === null
      ? []
      : [{
          clientCode: client.clientCode,
          protocol: "custom-sso" as const,
          expectedEpoch: client.customSso.expectedEpoch,
          ownerConfirmed: client.customSso.ownerStatus === "confirmed",
          targetCatalogVersion: client.customSso.targetCatalogVersion,
        }]),
    ...(client.oidc === null
      ? []
      : [{
          clientCode: client.clientCode,
          protocol: "oidc" as const,
          expectedEpoch: client.oidc.expectedEpoch,
          ownerConfirmed: client.oidc.ownerStatus === "confirmed",
        }]),
  ]));
}
