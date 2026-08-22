import {
  listOrganizationResponsibilityTypes,
  type OrganizationResponsibilityTypeView,
} from '@admin/services/organization-responsibility';
import { PageContainer } from '@ant-design/pro-components';
import { Alert, Card, message, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

export default function OrganizationResponsibilityTypeCatalogPage() {
  const [catalog, setCatalog] = useState<OrganizationResponsibilityTypeView[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listOrganizationResponsibilityTypes()
      .then((types) => {
        if (active) setCatalog(types);
      })
      .catch((error: unknown) => {
        if (active) {
          message.error(
            error instanceof Error ? error.message : '加载责任类型目录失败',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageContainer title="责任类型目录" breadcrumbRender={false}>
      <Card>
        <Alert
          type="info"
          showIcon
          title="责任类型由 IAM 受控发布维护，管理端不可新增、修改或删除。"
          style={{ marginBottom: 16 }}
        />
        <Table<OrganizationResponsibilityTypeView>
          rowKey="code"
          loading={loading}
          dataSource={catalog}
          pagination={false}
          columns={[
            {
              title: 'Code',
              dataIndex: 'code',
              render: (code) => <Typography.Text code>{code}</Typography.Text>,
            },
            { title: '名称', dataIndex: 'name' },
            { title: '说明', dataIndex: 'description' },
            {
              title: '任命基数',
              dataIndex: 'assignmentCardinality',
              render: (
                cardinality: OrganizationResponsibilityTypeView['assignmentCardinality'],
              ) => <Tag>{cardinality}</Tag>,
            },
            { title: '展示顺序', dataIndex: 'displayOrder' },
          ]}
        />
      </Card>
    </PageContainer>
  );
}
