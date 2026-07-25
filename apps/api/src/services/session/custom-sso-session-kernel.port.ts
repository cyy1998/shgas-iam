export interface CustomSsoOrcasLoginPort {
  orcasLogin: (input: {
    id: number;
    username: string;
    name: string;
    mobile?: string | null;
  }) => Promise<{
    orcasSessionId: string;
    orcasId: string;
  }>;
}
