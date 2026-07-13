export interface LogoutSsoSessionDeps {
  sessions: {
    logout: (sessionToken: string | undefined) => Promise<unknown>;
  };
}
