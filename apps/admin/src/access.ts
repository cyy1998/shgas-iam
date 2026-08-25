import { ADMIN_MODULE_ACCESS_KEYS } from './admin-route-registry';
import type { AdminCapabilitySummary } from '@iam/contracts';

export default function access(initialState: {
  capabilities?: AdminCapabilitySummary;
}) {
  const capabilities = initialState?.capabilities;
  const visibleModules = new Set(capabilities?.visibleModules ?? []);

  return {
    ...Object.fromEntries(
      Object.entries(ADMIN_MODULE_ACCESS_KEYS).map(([module, key]) => [
        key,
        visibleModules.has(module as never),
      ]),
    ),
    canCreateUser:
      capabilities?.collectionActions.user.create.allowed ?? false,
    canCreateEmployment:
      capabilities?.collectionActions.employment.create.allowed ?? false,
    canCreateOrganizationRoot:
      capabilities?.collectionActions.organization.createRoot.allowed ?? false,
    canCreatePosition:
      capabilities?.collectionActions.position.create.allowed ?? false,
    canEditPosition:
      capabilities?.collectionActions.position.edit.allowed ?? false,
    canChangePositionStatus:
      capabilities?.collectionActions.position.changeStatus.allowed ?? false,
    canDeletePosition:
      capabilities?.collectionActions.position.delete.allowed ?? false,
  };
}
