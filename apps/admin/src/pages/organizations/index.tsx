import { useAccess } from "@admin/admin-access";
import OrgDetailPanel from "@admin/pages/organizations/components/OrgDetailPanel";
import OrgFormModal from "@admin/pages/organizations/components/OrgFormModal";
import OrgSearchPanel from "@admin/pages/organizations/components/OrgSearchPanel";
import OrgTree from "@admin/pages/organizations/components/OrgTree";
import type { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  getOrganization,
  getOrganizationChildren,
  getOrganizationSelectorNodes,
  type OrganizationChildrenPage,
  type OrganizationDetailVo,
} from "@admin/services/organization";
import { PlusOutlined } from "@ant-design/icons";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Card, Col, message, Row, Space } from "antd";
import { useCallback, useEffect, useState } from "react";
import styles from "./OrganizationsPage.module.less";

type FormState =
  | { open: false }
  | { open: true; mode: "create-root" }
  | { open: true; mode: "create-child"; parentCode: string }
  | { open: true; mode: "edit"; initialValues: OrganizationDetailVo };

const DETAIL_CHILDREN_DEFAULT_SIZE = 20;

export default function OrganizationsPage() {
  const access = useAccess();
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [committedWarning, setCommittedWarning] = useState<string>();
  const [formState, setFormState] = useState<FormState>({ open: false });

  const [detailData, setDetailData] = useState<(OrganizationDetailVo & { pathLabel: string }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailChildrenPage, setDetailChildrenPage] = useState<OrganizationChildrenPage | null>(null);
  const [detailChildrenLoading, setDetailChildrenLoading] = useState(false);
  const [detailChildrenPageNum, setDetailChildrenPageNum] = useState(1);
  const [detailChildrenPageSize, setDetailChildrenPageSize] = useState(DETAIL_CHILDREN_DEFAULT_SIZE);

  const [treeReloadSeq, setTreeReloadSeq] = useState(0);

  const loadChildrenPage = useCallback(
    (parentOrgCode: string | null, pageNum: number) => getOrganizationChildren(parentOrgCode, pageNum, 50),
    [],
  );

  const loadDetail = useCallback(async (orgCode: string) => {
    setDetailLoading(true);
    try {
      const [d, nodes] = await Promise.all([getOrganization(orgCode), getOrganizationSelectorNodes({ orgCode })]);
      const pathLabel = nodes
        .find((node) => node.orgCode === orgCode)
        ?.fullPath.map((node) => `${node.orgCode}（${node.orgName}）`)
        .join(" / ");
      setDetailData({ ...d, pathLabel: pathLabel || "—" });
    } catch (err) {
      setDetailData(null);
      message.error(err instanceof Error ? err.message : "加载组织详情失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadDetailChildren = useCallback(async (orgCode: string, pageNum: number, pageSize: number) => {
    setDetailChildrenLoading(true);
    try {
      const page = await getOrganizationChildren(orgCode, pageNum, pageSize);
      setDetailChildrenPage(page);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载下级组织失败");
    } finally {
      setDetailChildrenLoading(false);
    }
  }, []);

  // 切换选中组织：重置分页并加载 detail + 下级首页
  useEffect(() => {
    if (!selectedCode) return;
    loadDetail(selectedCode);
    loadDetailChildren(selectedCode, 1, DETAIL_CHILDREN_DEFAULT_SIZE);
  }, [selectedCode, loadDetail, loadDetailChildren]);

  const selectOrganization = (orgCode: string) => {
    if (orgCode === selectedCode) return;
    setDetailChildrenPageNum(1);
    setDetailChildrenPageSize(DETAIL_CHILDREN_DEFAULT_SIZE);
    setSelectedCode(orgCode);
  };

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
      loadDetailChildren(selectedCode, detailChildrenPageNum, detailChildrenPageSize);
    }
  };

  const onSuccess = () => {
    setFormState({ open: false });
    refreshAll();
  };

  const onCommitted = (error: AdminMutationCommittedError) => {
    setCommittedWarning(error.message);
    setFormState({ open: false });
    refreshAll();
  };

  const onDetailChanged = () => {
    setDetailData(null);
    setDetailChildrenPage(null);
    setDetailChildrenPageNum(1);
    setDetailChildrenPageSize(DETAIL_CHILDREN_DEFAULT_SIZE);
    setSelectedCode(undefined);
    setTreeReloadSeq((s) => s + 1);
  };

  return (
    <PageContainer title={false} breadcrumbRender={false} className={styles.page}>
      {committedWarning && <Alert type="warning" showIcon message={committedWarning} />}
      <Row gutter={[16, 16]} align="top">
        <Col xs={24} lg={8} xl={7}>
          <Card size="small" className={styles.tree} title="组织树">
            <div className={styles["tree-content"]}>
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                <OrgSearchPanel onSelect={selectOrganization} />
                <OrgTree
                  loadChildrenPage={loadChildrenPage}
                  selectedKey={selectedCode}
                  onSelect={selectOrganization}
                  reloadSeq={treeReloadSeq}
                />
              </Space>
            </div>
            {access.canCreateOrganizationRoot && (
              <div className={styles["tree-footer"]}>
                <Button
                  type="text"
                  className={styles["create-root"]}
                  icon={<PlusOutlined aria-hidden />}
                  onClick={() => setFormState({ open: true, mode: "create-root" })}
                >
                  新建根组织
                </Button>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={16} xl={17}>
          <Card size="small" styles={{ body: { padding: 0 } }}>
            <OrgDetailPanel
              loading={detailLoading}
              detail={detailData}
              pathLabel={detailData?.pathLabel}
              childrenPage={detailChildrenPage}
              childrenLoading={detailChildrenLoading}
              onChildrenPageChange={onDetailChildrenPageChange}
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
              onSelectChild={selectOrganization}
              onChanged={refreshAll}
              onDeleted={onDetailChanged}
              onCommitted={onCommitted}
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
        onCommitted={onCommitted}
      />
    </PageContainer>
  );
}
