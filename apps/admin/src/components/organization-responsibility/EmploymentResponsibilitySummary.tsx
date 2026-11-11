import { searchOrganizationResponsibilityAssignments } from "@admin/services/organization-responsibility";
import { OrganizationResponsibilityAssignmentStatus } from "@iam/contracts";
import { List, Skeleton, Space, Tag, Typography, theme } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  formatOrganizationResponsibilityStatus,
  formatOrganizationResponsibilityType,
} from "./organizationResponsibilityPresentation";

const statusColors = {
  [OrganizationResponsibilityAssignmentStatus.Enable]: "green",
  [OrganizationResponsibilityAssignmentStatus.Pause]: "gold",
  [OrganizationResponsibilityAssignmentStatus.Disable]: "default",
};

function assignmentPath(employmentId: number, assignmentId?: number) {
  const params = new URLSearchParams({
    employment: String(employmentId),
    lifecycle: "open",
  });
  if (assignmentId) params.set("assignment", String(assignmentId));
  return `/organization-responsibilities/assignments?${params.toString()}`;
}

export default function EmploymentResponsibilitySummary({
  employmentId,
  compact = false,
}: {
  employmentId: number;
  compact?: boolean;
}) {
  const { token } = theme.useToken();
  const [result, setResult] = useState<Awaited<ReturnType<typeof searchOrganizationResponsibilityAssignments>> | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    searchOrganizationResponsibilityAssignments({
      employmentId,
      lifecycle: "open",
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

  if (!result && !failed) return <Skeleton active title={false} paragraph={{ rows: 1 }} />;

  const items = result?.items ?? [];
  const hasMore = result?.nextCursor || (compact && items.length > 2);

  return (
    <Space orientation="vertical" size={compact ? 4 : 8} style={{ width: "100%", minWidth: 0 }}>
      {failed ? (
        <Typography.Text type="danger">组织责任加载失败</Typography.Text>
      ) : result?.items.length === 0 ? (
        <Typography.Text type="secondary">暂无组织责任</Typography.Text>
      ) : (
        <List
          rowKey="id"
          size="small"
          split={false}
          dataSource={compact ? items.slice(0, 2) : items}
          renderItem={(assignment) => (
            <List.Item
              style={
                compact
                  ? { padding: "4px 0" }
                  : {
                      padding: "12px 14px",
                      marginBottom: 8,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 8,
                      background: token.colorFillAlter,
                    }
              }
            >
              <Space size={[compact ? 6 : 10, 4]} wrap style={{ width: "100%", minWidth: 0 }}>
                <Link
                  to={assignmentPath(employmentId, assignment.id)}
                  style={{
                    fontSize: compact ? 13 : 14,
                    fontWeight: compact ? undefined : 500,
                    overflowWrap: "anywhere",
                  }}
                >
                  {assignment.targetOrganization.orgName}
                </Link>
                <Typography.Text type="secondary" style={{ fontSize: compact ? 12 : 13 }}>
                  {formatOrganizationResponsibilityType(assignment.typeCode, { includeCode: false })}
                </Typography.Text>
                <Tag color={statusColors[assignment.status]} style={{ marginInlineEnd: 0, fontSize: 12 }}>
                  {formatOrganizationResponsibilityStatus(assignment.status)}
                </Tag>
              </Space>
            </List.Item>
          )}
        />
      )}
      <Link
        to={assignmentPath(employmentId)}
        aria-label="查看全部组织责任"
        style={compact ? { fontSize: 12 } : undefined}
      >
        查看全部组织责任{hasMore ? "（还有更多）" : ""}
      </Link>
    </Space>
  );
}
