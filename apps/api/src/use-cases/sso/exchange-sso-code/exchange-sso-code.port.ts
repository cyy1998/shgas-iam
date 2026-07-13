import type { ClientManagementLevel } from "@iam/contracts";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { UserDetailDto } from "@iam/domain/user";
import type {
  ExchangeSsoCodeOptions,
  ExchangeSsoConsumedAuthCode,
} from "./exchange-sso-code.type";

export interface ExchangeSsoCodeDeps {
  clients: {
    getClientByCode: (clientCode: string) => Promise<CustomSsoClientRuntimeDto | null>;
  };
  sessions: {
    consumeAuthCode: (input: {
      clientCode: string;
      code: string;
      invalidCodeError: "invalid_auth_code";
    }) => Promise<ExchangeSsoConsumedAuthCode>;
    createLocalSession: (input: {
      authCode: ExchangeSsoConsumedAuthCode;
      client: CustomSsoClientRuntimeDto;
      mode: ClientManagementLevel.Independent;
      requestContext?: ExchangeSsoCodeOptions["requestContext"];
      userDetail: UserDetailDto;
    }) => Promise<{ token: string; ttl: number; userInfo: UserDetailDto }>;
  };
}
