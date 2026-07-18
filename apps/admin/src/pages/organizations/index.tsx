import OrgDetailPanel from '@admin/pages/organizations/components/OrgDetailPanel';
import OrgFormModal from '@admin/pages/organizations/components/OrgFormModal';
import OrgSearchPanel from '@admin/pages/organizations/components/OrgSearchPanel';
import OrgTree from '@admin/pages/organizations/components/OrgTree';
import {
  getOrganization,
  getOrganizationChildren,
  type OrganizationChildrenPage,
  type OrganizationDetailVo,
} from '@admin/services/organization';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Col, message, Row, Space } from 'antd';
import { useCallback, useEffect, useState } from 'react';

type FormState =
  | { open: false }
  | { open: true; mode: 'create-root' }
  | { open: true; mode: 'create-child'; parentCode: string }
  | { open: true; mode: 'edit'; initialValues: OrganizationDetailVo };

const DETAIL_CHILDREN_DEFAULT_SIZE = 20;

export default function OrganizationsPage() {
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [formState, setFormState] = useState<FormState>({ open: false });

  const [detailData, setDetailData] = useState<OrganizationDetailVo | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailChildrenPage, setDetailChildrenPage] =
    useState<OrganizationChildrenPage | null>(null);
  const [detailChildrenLoading, setDetailChildrenLoading] = useState(false);
  const [detailChildrenPageNum, setDetailChildrenPageNum] = useState(1);
  const [detailChildrenPageSize, setDetailChildrenPageSize] = useState(
    DETAIL_CHILDREN_DEFAULT_SIZE,
  );

  const [treeReloadSeq, setTreeReloadSeq] = useState(0);

  const loadChildrenPage = useCallback(
    (parentOrgCode: string | null, pageNum: number) =>
      getOrganizationChildren(parentOrgCode, pageNum, 50),
    [],
  );

  const loadDetail = useCallback(async (orgCode: string) => {
    setDetailLoading(true);
    try {
      const d = await getOrganization(orgCode);
      setDetailData(d);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载组织详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadDetailChildren = useCallback(
    async (orgCode: string, pageNum: number, pageSize: number) => {
      setDetailChildrenLoading(true);
      try {
        const page = await getOrganizationChildren(orgCode, pageNum, pageSize);
        setDetailChildrenPage(page);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载下级组织失败');
      } finally {
        setDetailChildrenLoading(false);
      }
    },
    [],
  );

  // 切换选中组织：重置分页并加载 detail + 下级首页
  useEffect(() => {
    if (!selectedCode) {
      setDetailData(null);
      setDetailChildrenPage(null);
      setDetailChildrenPageNum(1);
      setDetailChildrenPageSize(DETAIL_CHILDREN_DEFAULT_SIZE);
      return;
    }
    setDetailChildrenPageNum(1);
    setDetailChildrenPageSize(DETAIL_CHILDREN_DEFAULT_SIZE);
    loadDetail(selectedCode);
    loadDetailChildren(selectedCode, 1, DETAIL_CHILDREN_DEFAULT_SIZE);
  }, [selectedCode, loadDetail, loadDetailChildren]);

  const onDetailChildrenPageChange = (pageNum: number, pageSize: number) => {
    if (!selectedCode) return;
    setDetailChildrenPageNum(pageNum);
    setDetailChildrenPageSize(pageSize);
    loadDetailChildren(selectedCode, pageNum, pageSize);
  };

  const refreshAll = () => {
    setTreeReloadSeq((s) => s + 1);
    if (selectedCode) {
      loadDetail(selectedCode);
      loadDetailChildren(
        selectedCode,
        detailChildrenPageNum,
        detailChildrenPageSize,
      );
    }
  };

  const onSuccess = () => {
    setFormState({ open: false });
    refreshAll();
  };

  const onDetailChanged = () => {
    setSelectedCode(undefined);
    setTreeReloadSeq((s) => s + 1);
  };

  return (
    <PageContainer title="组织管理">
      <Row gutter={16}>
        <Col span={8}>
          <Card
            title="组织树"
            extra={
              <Button
                type="primary"
                size="small"
                onClick={() =>
                  setFormState({ open: true, mode: 'create-root' })
                }
              >
                + 新建根组织
              </Button>
            }
          >
            <Space
              orientation="vertical"
              size="middle"
              style={{ width: '100%' }}
            >
              <OrgSearchPanel onSelect={(code) => setSelectedCode(code)} />
              <OrgTree
                loadChildrenPage={loadChildrenPage}
                selectedKey={selectedCode}
                onSelect={(code) => setSelectedCode(code)}
                reloadSeq={treeReloadSeq}
              />
            </Space>
          </Card>
        </Col>
        <Col span={16}>
          <Card styles={{ body: { padding: 0 } }}>
            <OrgDetailPanel
              loading={detailLoading}
              detail={detailData}
              childrenPage={detailChildrenPage}
              childrenLoading={detailChildrenLoading}
              onChildrenPageChange={onDetailChildrenPageChange}
              onEdit={() => {
                if (detailData) {
                  setFormState({
                    open: true,
                    mode: 'edit',
                    initialValues: detailData,
                  });
                }
              }}
              onCreateChild={() => {
                if (selectedCode) {
                  setFormState({
                    open: true,
                    mode: 'create-child',
                    parentCode: selectedCode,
                  });
                }
              }}
              onSelectChild={(code) => setSelectedCode(code)}
              onChanged={onDetailChanged}
            />
          </Card>
        </Col>
      </Row>

      <OrgFormModal
        open={formState.open}
        mode={formState.open ? formState.mode : 'create-root'}
        initialValues={
          formState.open && formState.mode === 'edit'
            ? formState.initialValues
            : null
        }
        parentCode={
          formState.open && formState.mode === 'create-child'
            ? formState.parentCode
            : null
        }
        onOpenChange={(open) => {
          if (!open) setFormState({ open: false });
        }}
        onSuccess={onSuccess}
      />
    </PageContainer>
  );
}
