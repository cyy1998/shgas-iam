import { searchOrganizationResponsibilityAssignments } from '@admin/services/organization-responsibility';
import { Link } from '@umijs/max';
import { List, Skeleton, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  formatOrganizationResponsibilityStatus,
  formatOrganizationResponsibilityType,
} from './organizationResponsibilityPresentation';

function assignmentPath(employmentId: number, assignmentId?: number) {
  const params = new URLSearchParams({
    employment: String(employmentId),
    lifecycle: 'open',
  });
  if (assignmentId) params.set('assignment', String(assignmentId));
  return `/organization-responsibilities/assignments?${params.toString()}`;
}

export default function EmploymentResponsibilitySummary({
  employmentId,
  compact = false,
}: {
  employmentId: number;
  compact?: boolean;
}) {
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof searchOrganizationResponsibilityAssignments>
  > | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    searchOrganizationResponsibilityAssignments({
      employmentId,
      lifecycle: 'open',
      limit: 20,
    })
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [employmentId]);

  if (!result && !failed)
    return <Skeleton active title={false} paragraph={{ rows: 1 }} />;

  const items = result?.items ?? [];
  const hasMore = result?.nextCursor || (compact && items.length > 2);

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {failed ? (
        <Typography.Text type="danger">组织责任加载失败</Typography.Text>
      ) : result?.items.length === 0 ? (
        <Typography.Text type="secondary">暂无组织责任</Typography.Text>
      ) : (
        <List
          size="small"
          split={!compact}
          dataSource={compact ? items.slice(0, 2) : items}
          renderItem={(assignment) => (
            <List.Item style={compact ? { padding: '2px 0' } : undefined}>
              <Space wrap>
                <span>
                  {formatOrganizationResponsibilityType(assignment.typeCode)}
                </span>
                <span>{assignment.targetOrganization.orgName}</span>
                <Tag>
                  {formatOrganizationResponsibilityStatus(assignment.status)}
                </Tag>
                <Link
                  to={assignmentPath(employmentId, assignment.id)}
                  aria-label={`查看任命 #${assignment.id}`}
                >
                  #{assignment.id}
                </Link>
              </Space>
            </List.Item>
          )}
        />
      )}
      <Link to={assignmentPath(employmentId)} aria-label="查看全部组织责任">
        查看全部组织责任{hasMore ? '（还有更多）' : ''}
      </Link>
    </Space>
  );
}
