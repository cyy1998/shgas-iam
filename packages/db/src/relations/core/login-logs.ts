import type { RelationsConfig, RelationsHelper } from "../types";

export function loginLogsRelations(r: RelationsHelper) {
  return {
    loginLogs: {
      user: r.one.users({
        from: r.loginLogs.userId,
        to: r.users.id,
      }),
    },
  } satisfies RelationsConfig;
}
