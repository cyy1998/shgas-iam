export interface AuthorizationGrantRemovalStore {
  readonly remove: (grantId: string) => Promise<"removed" | "missing">;
}
