import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { UserDetailDto } from "@iam/domain/user";
import type { ExchangeSsoCodeOptions } from "./exchange-sso-code.type";

export interface IndependentAuthorizationGrantPort {
  redeemIndependentGrant: (input: {
    client: CustomSsoClientRuntimeDto;
    code: string;
    requestContext?: ExchangeSsoCodeOptions["requestContext"];
  }) => Promise<{
    credential: string;
    ttl: number;
    userInfo: UserDetailDto;
  }>;
}

export interface ExchangeSsoCodeDeps {
  authorizationGrants: IndependentAuthorizationGrantPort;
  clients: {
    getClientByCode: (clientCode: string) => Promise<CustomSsoClientRuntimeDto | null>;
  };
}
