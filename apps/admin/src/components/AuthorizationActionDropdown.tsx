import { getAdminAuthorizationReasonText } from '@admin/services/authorization';
import type { AdminAuthorizationDecision } from '@iam/contracts';
import { Button, Dropdown, Tooltip } from 'antd';
import type { DropdownProps } from 'antd';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  decision: AdminAuthorizationDecision;
  menu: DropdownProps['menu'];
};

export default function AuthorizationActionDropdown({
  children,
  decision,
  menu,
}: Props) {
  const reason = getAdminAuthorizationReasonText(decision.reason);
  return (
    <Tooltip title={reason}>
      <span>
        <Dropdown disabled={!decision.allowed} menu={menu}>
          <Button disabled={!decision.allowed} title={reason ?? undefined}>
            {children}
          </Button>
        </Dropdown>
      </span>
    </Tooltip>
  );
}
