import AuditLogTable from "@admin/components/audit/AuditLogTable";
import { PageContainer } from "@ant-design/pro-components";

export default function AuditLogsPage() {
  return (
    <PageContainer title={false} breadcrumbRender={false}>
      <AuditLogTable />
    </PageContainer>
  );
}
