import OrgDetailPanel from "@/pages/organizations/components/OrgDetailPanel";
import OrgFormModal from "@/pages/organizations/components/OrgFormModal";
import OrgSearchPanel from "@/pages/organizations/components/OrgSearchPanel";
import OrgTree from "@/pages/organizations/components/OrgTree";
import {
  getOrganization,
  getOrganizationChildren,
  type OrganizationDetailVo,
  type OrganizationTreeNode,
} from "@/services/organization";
import { PageContainer } from "@ant-design/pro-components";
import { Button, Card, Col, message, Row, Space } from "antd";
import { useCallback, useEffect, useState } from "react";

type FormState =
  | { open: false }
  | { open: true; mode: "create-root" }
  | { open: true; mode: "create-child"; parentCode: string }
  | { open: true; mode: "edit"; initialValues: OrganizationDetailVo };

export default function OrganizationsPage() {
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [formState, setFormState] = useState<FormState>({ open: false });

  const [detailData, setDetailData] = useState<OrganizationDetailVo | null>(null);
  const [detailChildren, setDetailChildren] = useState<OrganizationTreeNode[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [treeReloadSeq, setTreeReloadSeq] = useState(0);

  const loadChildren = useCallback(
    (parentOrgCode: string | null) => getOrganizationChildren(parentOrgCode),
    [],
  );

  const loadDetail = useCallback(async (orgCode: string) => {
    setDetailLoading(true);
    try {
      const [d, children] = await Promise.all([
        getOrganization(orgCode),
        getOrganizationChildren(orgCode),
      ]);
      setDetailData(d);
      setDetailChildren(children);
    }
    catch (err) {
      message.error(err instanceof Error ? err.message : "加载组织详情失败");
    }
    finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCode) {
      loadDetail(selectedCode);
    }
    else {
      setDetailData(null);
      setDetailChildren([]);
    }
  }, [selectedCode, loadDetail]);

  const refreshAll = () => {
    setTreeReloadSeq(s => s + 1);
    if (selectedCode) loadDetail(selectedCode);
  };

  const onSuccess = () => {
    setFormState({ open: false });
    refreshAll();
  };

  const onDetailChanged = () => {
    setSelectedCode(undefined);
    setTreeReloadSeq(s => s + 1);
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
                onClick={() => setFormState({ open: true, mode: "create-root" })}
              >
                + 新建根组织
              </Button>
            }
          >
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <OrgSearchPanel onSelect={code => setSelectedCode(code)} />
              <OrgTree
                loadChildren={loadChildren}
                selectedKey={selectedCode}
                onSelect={code => setSelectedCode(code)}
                reloadSeq={treeReloadSeq}
              />
            </Space>
          </Card>
        </Col>
        <Col span={16}>
          <Card bodyStyle={{ padding: 0 }}>
            <OrgDetailPanel
              loading={detailLoading}
              detail={detailData}
              childrenNodes={detailChildren}
              onEdit={() => {
                if (detailData) {
                  setFormState({
                    open: true,
                    mode: "edit",
                    initialValues: detailData,
                  });
                }
              }}
              onCreateChild={() => {
                if (selectedCode) {
                  setFormState({
                    open: true,
                    mode: "create-child",
                    parentCode: selectedCode,
                  });
                }
              }}
              onSelectChild={code => setSelectedCode(code)}
              onChanged={onDetailChanged}
            />
          </Card>
        </Col>
      </Row>

      <OrgFormModal
        open={formState.open}
        mode={formState.open ? formState.mode : "create-root"}
        initialValues={formState.open && formState.mode === "edit" ? formState.initialValues : null}
        parentCode={formState.open && formState.mode === "create-child" ? formState.parentCode : null}
        onOpenChange={(open) => {
          if (!open) setFormState({ open: false });
        }}
        onSuccess={onSuccess}
      />
    </PageContainer>
  );
}
