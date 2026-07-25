import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type {
  CompleteSsoCallbackOptions,
  CompleteSsoCallbackResult,
} from "./complete-sso-callback.type";

export interface GatewayLoginCompletionPort {
  completeGatewayLogin: (input: {
    client: CustomSsoClientRuntimeDto;
    code: string;
    redirectUrl: string;
    requestContext?: CompleteSsoCallbackOptions["requestContext"];
  }) => Promise<CompleteSsoCallbackResult>;
}

export interface CompleteSsoCallbackDeps {
  authorizationGrants: GatewayLoginCompletionPort;
  clients: {
    getClientByCode: (clientCode: string) => Promise<CustomSsoClientRuntimeDto | null>;
  };
  redirectUrls: {
    isAllowed: (
      clientCode: string,
      redirectUrl: string,
      patterns: string[],
      options?: CompleteSsoCallbackOptions,
    ) => boolean;
  };
}
