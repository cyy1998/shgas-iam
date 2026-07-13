import type { ClientManagementLevel } from "@iam/contracts";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { UserDetailDto } from "@iam/domain/user";
import type {
  CompleteSsoCallbackOptions,
  ConsumedSsoAuthCode,
} from "./complete-sso-callback.type";

export interface CompleteSsoCallbackDeps {
  clients: {
    getClientByCode: (clientCode: string) => Promise<CustomSsoClientRuntimeDto | null>;
  };
  orcas: {
    orcasLogin: (user: UserDetailDto) => Promise<{ orcasSessionId: string; orcasId: string }>;
  };
  redirectUrls: {
    isAllowed: (
      clientCode: string,
      redirectUrl: string,
      patterns: string[],
      options?: CompleteSsoCallbackOptions,
    ) => boolean;
  };
  sessions: {
    consumeAuthCode: (input: {
      clientCode: string;
      code: string;
      invalidCodeError: "unauthorized";
      redirectUrl: string;
    }) => Promise<ConsumedSsoAuthCode>;
    createLocalSession: (input: {
      authCode: ConsumedSsoAuthCode;
      client: CustomSsoClientRuntimeDto;
      mode: ClientManagementLevel.Gateway;
      orcas?: { sessionId: string | null; userId: string } | null;
      requestContext?: CompleteSsoCallbackOptions["requestContext"];
      userDetail: UserDetailDto;
    }) => Promise<{ token: string }>;
  };
}
