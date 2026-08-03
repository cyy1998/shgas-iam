import type { CustomSsoSubjectProjectionV1 } from '@iam/client-subject-projection/custom-sso';

export type CurrentAdminUser = {
  username: string;
  name: string;
  roles: string[];
};

export function mapCurrentAdminUser(
  projection: CustomSsoSubjectProjectionV1,
): CurrentAdminUser {
  return {
    username: projection.profile?.username ?? '',
    name: projection.profile?.name ?? '',
    roles: [...(projection.authorization?.roles ?? [])],
  };
}
