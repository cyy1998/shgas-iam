import { getAdminAuthorizationReasonText } from '@admin/services/authorization';
import type { AdminAuthorizationDecision } from '@iam/contracts';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import type { ReactNode } from 'react';

type Props = Omit<ButtonProps, 'disabled' | 'title'> & {
  children: ReactNode;
  decision: AdminAuthorizationDecision;
};

export default function AuthorizationActionButton({
  children,
  decision,
  ...buttonProps
}: Props) {
  const reason = getAdminAuthorizationReasonText(decision.reason);
  return (
    <Tooltip title={reason}>
      <span>
        <Button
          {...buttonProps}
          disabled={!decision.allowed}
          title={reason ?? undefined}
        >
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}
