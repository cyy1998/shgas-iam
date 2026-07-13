import type { RedisPort } from "@api/composition/runtime";
import type { ClientDto } from "./client.type";

export interface ClientReaderPort {
  getClientByCode: (clientCode: string) => Promise<ClientDto | null>;
  getClientBySecret: (clientSecret: string) => Promise<ClientDto | null>;
}

export interface ClientServiceDeps {
  redis: Pick<RedisPort, "get" | "set" | "del">;
  clientRepository: ClientReaderPort;
}
