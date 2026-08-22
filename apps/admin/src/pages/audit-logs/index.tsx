import AuditLogTable from '@admin/components/audit/AuditLogTable';
import { PageContainer } from '@ant-design/pro-components';

export default function AuditLogsPage() {
  return (
    <PageContainer title="审计日志">
      <AuditLogTable />
    </PageContainer>
  );
}
