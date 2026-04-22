import OrgDetailPanel from "@/pages/organizations/components/OrgDetailPanel";
import OrgFormModal from "@/pages/organizations/components/OrgFormModal";
import OrgTree from "@/pages/organizations/components/OrgTree";
import {
  getOrganization,
  getOrganizationTree,
  type OrganizationDetailVo,
  type OrganizationTreeNode,
} from "@/services/organization";
import { PageContainer } from "@ant-design/pro-components";
import { Button, Card, Col, message, Row, Spin } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

type FormState =
  | { open: false }
  | { open: true; mode: "create-root" }
  | { open: true; mode: "create-child"; parentCode: string }
  | { open: true; mode: "edit"; initialValues: OrganizationDetailVo };

function findNode(
  nodes: OrganizationTreeNode[],
  orgCode: string,
): OrganizationTreeNode | undefined {
  for (const n of nodes) {
    if (n.orgCode === orgCode) return n;
    const child = findNode(n.children, orgCode);
    if (child) return child;
  }
  return undefined;
}

export default function OrganizationsPage() {
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [formState, setFormState] = useState<FormState>({ open: false });

  const [treeData, setTreeData] = useState<OrganizationTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);

  const [detailData, setDetailData] = useState<OrganizationDetailVo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const data = await getOrganizationTree();
      setTreeData(data);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载组织树失败");
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (orgCode: string) => {
    setDetailLoading(true);
    try {
      const data = await getOrganization(orgCode);
      setDetailData(data);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载组织详情失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (selectedCode) {
      loadDetail(selectedCode);
    } else {
      setDetailData(null);
    }
  }, [selectedCode, loadDetail]);

  const selectedChildren = useMemo(() => {
    if (!selectedCode) return [];
    const node = findNode(treeData, selectedCode);
    return node?.children ?? [];
  }, [selectedCode, treeData]);

  const refreshAll = () => {
    loadTree();
    if (selectedCode) loadDetail(selectedCode);
  };

  const onSuccess = () => {
    setFormState({ open: false });
    refreshAll();
  };

  const onDetailChanged = () => {
    refreshAll();
    setSelectedCode(undefined);
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
            {treeLoading ? (
              <Spin />
            ) : (
              <OrgTree
                data={treeData}
                selectedKey={selectedCode}
                onSelect={(code) => setSelectedCode(code)}
              />
            )}
          </Card>
        </Col>
        <Col span={16}>
          <Card bodyStyle={{ padding: 0 }}>
            <OrgDetailPanel
              loading={detailLoading}
              detail={detailData}
              childrenNodes={selectedChildren}
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
              onSelectChild={(code) => setSelectedCode(code)}
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
