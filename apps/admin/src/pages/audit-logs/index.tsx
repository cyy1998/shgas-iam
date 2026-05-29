import { PageContainer } from '@ant-design/pro-components';
import AuditLogTable from './components/AuditLogTable';

export default function AuditLogsPage() {
  return (
    <PageContainer title="审计日志">
      <AuditLogTable />
    </PageContainer>
  );
}
