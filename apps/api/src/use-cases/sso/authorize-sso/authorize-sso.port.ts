import type { CustomSsoClientMode } from "@iam/contracts";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type {
  AuthorizeSsoOptions,
  SsoPrincipalTokenSource,
} from "./authorize-sso.type";

export interface AuthorizationCodeIssuerPort {
  issueAuthorizationCode: (input: {
    clientCode: string;
    configVersion: number;
    mode: CustomSsoClientMode;
    redirectUrl: string;
    requestContext?: AuthorizeSsoOptions["requestContext"];
    token?: string;
    tokenSource: SsoPrincipalTokenSource;
    state?: string;
  }) => Promise<
    | { isLogin: false; code: null }
    | { isLogin: true; code: string }
  >;
}

export interface AuthorizeSsoClientReaderPort {
  findRuntimeRecord: (
    clientCode: string,
  ) => Promise<CustomSsoClientRuntimeDto | null>;
}

export interface AuthorizeSsoDeps {
  authorizationGrants: AuthorizationCodeIssuerPort;
  clients: AuthorizeSsoClientReaderPort;
  redirectUrls: {
    normalizeAllowed: (
      clientCode: string,
      redirectUrl: string,
      patterns: string[],
      options?: AuthorizeSsoOptions,
    ) => string | null;
  };
}
