import type { AccountRecoveryUser } from "./account-recovery.type";

export interface AccountRecoveryUserLookupPort {
  getActiveUserByUsername: (username: string) => Promise<AccountRecoveryUser | null>;
}

export interface AccountRecoveryServiceDeps {
  userLookup: AccountRecoveryUserLookupPort;
}
