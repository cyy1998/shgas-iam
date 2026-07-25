import type {
  AuthorizeSsoOptions,
  AuthorizeSsoResult,
  SsoPrincipalTokenSource,
} from "./authorize-sso.type";

export interface AuthorizationCodeIssuerPort {
  issueAuthorizationCode: (input: {
    clientCode: string;
    redirectUrl: string;
    requestContext?: AuthorizeSsoOptions["requestContext"];
    token?: string;
    tokenSource: SsoPrincipalTokenSource;
  }) => Promise<AuthorizeSsoResult>;
}

export interface AuthorizeSsoDeps {
  authorizationGrants: AuthorizationCodeIssuerPort;
  clients: {
    getClientByCode: (clientCode: string) => Promise<{
      extAttributes: { validRedirectUrls: string[] };
    } | null>;
  };
  redirectUrls: {
    isAllowed: (
      clientCode: string,
      redirectUrl: string,
      patterns: string[],
      options?: AuthorizeSsoOptions,
    ) => boolean;
  };
}
