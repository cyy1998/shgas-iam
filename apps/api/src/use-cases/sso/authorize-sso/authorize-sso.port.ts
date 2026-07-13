import type {
  AuthorizeSsoOptions,
  AuthorizeSsoResult,
  SsoPrincipalTokenSource,
} from "./authorize-sso.type";

export interface AuthorizeSsoDeps {
  clients: {
    getClientByCode: (clientCode: string) => Promise<{
      extAttributes: { validRedirectUrls: string[] };
    } | null>;
  };
  principalSessions: {
    authorize: (input: {
      clientCode: string;
      redirectUrl: string;
      requestContext?: AuthorizeSsoOptions["requestContext"];
      token?: string;
      tokenSource: SsoPrincipalTokenSource;
    }) => Promise<AuthorizeSsoResult>;
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
