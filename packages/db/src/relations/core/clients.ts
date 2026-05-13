import type { RelationsConfig, RelationsHelper } from "../types";

export function clientsRelations(r: RelationsHelper) {
  return {
    clients: {
      roles: r.many.roles({
        from: r.clients.id,
        to: r.roles.clientId,
      }),
    },
  } satisfies RelationsConfig;
}
