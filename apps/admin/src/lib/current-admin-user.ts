import type { CustomSsoSubjectProjection } from '@iam/client-subject-projection/custom-sso';

export type CurrentAdminUser = {
  username: string;
  name: string;
  roles: string[];
};

export function mapCurrentAdminUser(
  projection: CustomSsoSubjectProjection,
): CurrentAdminUser {
  return {
    username: projection.profile?.username ?? '',
    name: projection.profile?.name ?? '',
    roles: [...(projection.authorization?.roles ?? [])],
  };
}
