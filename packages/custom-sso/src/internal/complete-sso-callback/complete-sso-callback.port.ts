import type {
  ClientStatus,
  CustomSsoClientMode,
} from "@iam/contracts";
import type { RejectedAuthorizationGrantPort } from "../authorization-grant.port";
import type {
  CompleteSsoCallbackOptions,
  CompleteSsoCallbackResult,
} from "./complete-sso-callback.type";

export interface GatewayLoginCompletionPort extends RejectedAuthorizationGrantPort {
  completeGatewayLogin: (input: {
    client: {
      readonly clientCode: string;
      readonly configVersion: number;
      readonly orcasEnabled: boolean;
    };
    code: string;
    redirectUrl: string;
    requestContext?: CompleteSsoCallbackOptions["requestContext"];
  }) => Promise<CompleteSsoCallbackResult>;
}

export interface GatewayCallbackClientReaderPort {
  findRuntimeRecord: (
    clientCode: string,
  ) => Promise<{
    readonly clientCode: string;
    readonly status: ClientStatus;
    readonly isDelete: boolean;
    readonly customSsoEnabled: boolean;
    readonly customSsoConfig: {
      readonly mode: CustomSsoClientMode;
      readonly orcas?: {
        readonly enabled: boolean;
      };
    } | null;
    readonly customSsoConfigVersion: number;
  } | null>;
}

export interface CompleteSsoCallbackTrafficGatePort {
  assertIssuanceAllowed: (clientCode: string) => Promise<void>;
}

export interface CompleteSsoCallbackDeps {
  authorizationGrants: GatewayLoginCompletionPort;
  clients: GatewayCallbackClientReaderPort;
  trafficGate: CompleteSsoCallbackTrafficGatePort;
}
