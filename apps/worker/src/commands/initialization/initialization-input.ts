import { ClientSsoConfigSchema, OrganizationType, UserType } from "@iam/contracts";
import { z } from "zod";

const nonempty = z.string().trim().min(1);
const clientCodes = ["iam", "iam-admin", "gds"] as const;

export const InitializationInputSchema = z
  .object({
    admin: z.object({ username: nonempty.max(64), name: nonempty.max(64), userType: z.enum(UserType) }).strict(),
    organization: z
      .object({
        orgCode: nonempty,
        orgName: nonempty,
        orgType: z.enum(OrganizationType),
        isEntity: z.boolean(),
        isVirtual: z.boolean(),
      })
      .strict(),
    position: z.object({ posCode: nonempty.max(64), posName: nonempty.max(128) }).strict(),
    adminRoleName: nonempty.max(128),
    clients: z
      .array(
        z
          .object({
            clientCode: z.enum(clientCodes),
            clientName: nonempty.max(128),
            url: z.url().max(128),
            ssoConfig: ClientSsoConfigSchema,
          })
          .strict(),
      )
      .length(3)
      .refine(
        (values) => new Set(values.map((item) => item.clientCode)).size === 3,
        "必须提供 iam、iam-admin、gds 各一个 Client",
      ),
  })
  .strict();

export type InitializationInput = z.infer<typeof InitializationInputSchema>;

const secretNames = {
  iam: ["IAM_INITIAL_IAM_CLIENT_SECRET", "IAM_INITIAL_IAM_SSO_SECRET"],
  "iam-admin": ["IAM_INITIAL_ADMIN_CLIENT_SECRET", "IAM_INITIAL_ADMIN_SSO_SECRET"],
  gds: ["IAM_INITIAL_GDS_CLIENT_SECRET", "IAM_INITIAL_GDS_SSO_SECRET"],
} as const;

export function resolveInitializationSecrets(environment: NodeJS.ProcessEnv) {
  function required(name: string) {
    const value = environment[name];
    if (!value || value.length > 255) throw new Error(`初始化必须显式注入 ${name}（1–255 字符）`);
    return value;
  }
  return {
    adminPassword: required("IAM_INITIAL_ADMIN_PASSWORD"),
    clients: Object.fromEntries(
      clientCodes.map((code) => [
        code,
        {
          clientSecret: required(secretNames[code][0]),
          ssoSecret: required(secretNames[code][1]),
        },
      ]),
    ) as Record<(typeof clientCodes)[number], { clientSecret: string; ssoSecret: string }>,
  };
}

export type InitializationSecrets = ReturnType<typeof resolveInitializationSecrets>;
