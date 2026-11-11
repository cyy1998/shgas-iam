import type { CurrentAdminUser } from "@admin/lib/current-admin-user";
import { getAdminCapabilitySummary } from "@admin/services/authorization";
import { loadCurrentAdminUser } from "@admin/services/current-user";
import { redirectToLogin } from "@admin/utils/auth";
import type { AdminCapabilitySummary } from "@iam/contracts";
import { useRouteLoaderData } from "react-router";

type AdminSession = {
  currentUser?: CurrentAdminUser;
  capabilities?: AdminCapabilitySummary;
};

export const adminSessionRouteId = "admin-session";

export async function loadAdminSession(): Promise<AdminSession> {
  let result: Awaited<ReturnType<typeof loadCurrentAdminUser>>;
  try {
    result = await loadCurrentAdminUser();
  } catch {
    return {};
  }

  if (result.kind === "unauthenticated") {
    redirectToLogin();
    return new Promise(() => {});
  }
  if (result.kind !== "available") return {};

  const currentUser = result.user;
  try {
    return { currentUser, capabilities: await getAdminCapabilitySummary() };
  } catch {
    return { currentUser };
  }
}

export function useAdminSession() {
  const session = useRouteLoaderData<typeof loadAdminSession>(adminSessionRouteId);
  if (!session) throw new Error("Admin session loader is missing");
  return session;
}
