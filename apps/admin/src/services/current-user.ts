import { API_PREFIX, SSO_CLIENT_CODE } from "@admin/constants/config";
import { type CurrentAdminUser, mapCurrentAdminUser } from "@admin/lib/current-admin-user";
import { CustomSsoSubjectProjectionSchema } from "@iam/custom-sso/wire";
import { z } from "zod";

const CurrentUserResponseSchema = z.object({ code: z.literal(200), data: CustomSsoSubjectProjectionSchema });

export type CurrentAdminUserLoadResult =
  | { kind: "available"; user: CurrentAdminUser }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

export async function loadCurrentAdminUser(): Promise<CurrentAdminUserLoadResult> {
  const response = await fetch(`${API_PREFIX}/public/user-info`, {
    credentials: "include",
    headers: { Client: SSO_CLIENT_CODE },
  });
  if (response.status === 401) return { kind: "unauthenticated" };
  if (!response.ok) return { kind: "unavailable" };
  const body = CurrentUserResponseSchema.parse(await response.json());
  return { kind: "available", user: mapCurrentAdminUser(body.data) };
}
