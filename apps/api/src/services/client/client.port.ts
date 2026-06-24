import type { RedisPort } from "@api/composition/runtime";
import type { ClientRepository } from "./client.repository";

export interface ClientServiceDeps {
  redis: Pick<RedisPort, "get" | "set" | "del">;
  clientRepository: Pick<ClientRepository, "getClientByCode" | "getClientBySecret">;
}
