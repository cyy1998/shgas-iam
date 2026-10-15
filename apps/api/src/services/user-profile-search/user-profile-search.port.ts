import type { UserProfileBase } from "@iam/domain/user";

export interface UserProfileSearchPort {
  readonly searchDsl: (input: unknown) => Promise<UserProfileBase[]>;
}
