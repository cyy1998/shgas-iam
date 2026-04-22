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
import { useRequest } from "@umijs/max";
import { Button, Card, Col, message, Row, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";

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

  const treeReq = useRequest(() => getOrganizationTree(), {
    onError: (e) => message.error(e instanceof Error ? e.message : "加载组织树失败"),
  });

  const detailReq = useRequest<OrganizationDetailVo, [string]>(
    (orgCode: string) => getOrganization(orgCode),
    {
      manual: true,
      onError: (e) => message.error(e instanceof Error ? e.message : "加载组织详情失败"),
    },
  );

  useEffect(() => {
    if (selectedCode) {
      detailReq.run(selectedCode);
    }
  }, [selectedCode]);

  const selectedChildren = useMemo(() => {
    if (!selectedCode || !treeReq.data) return [];
    const node = findNode(treeReq.data, selectedCode);
    return node?.children ?? [];
  }, [selectedCode, treeReq.data]);

  const refreshAll = () => {
    treeReq.refresh();
    if (selectedCode) detailReq.run(selectedCode);
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
            {treeReq.loading ? (
              <Spin />
            ) : (
              <OrgTree
                data={treeReq.data ?? []}
                selectedKey={selectedCode}
                onSelect={(code) => setSelectedCode(code)}
              />
            )}
          </Card>
        </Col>
        <Col span={16}>
          <Card bodyStyle={{ padding: 0 }}>
            <OrgDetailPanel
              loading={detailReq.loading}
              detail={detailReq.data ?? null}
              childrenNodes={selectedChildren}
              onEdit={() => {
                if (detailReq.data) {
                  setFormState({
                    open: true,
                    mode: "edit",
                    initialValues: detailReq.data,
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
