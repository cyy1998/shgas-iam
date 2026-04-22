import type { OrganizationTreeNode } from "@/services/organization";
import { getOrganizationStatusOptions } from "@iam/shared";
import { Badge, Empty, Spin, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

type Props = {
  loadChildren: (parentOrgCode: string | null) => Promise<OrganizationTreeNode[]>;
  selectedKey?: string;
  onSelect: (orgCode: string, node: OrganizationTreeNode) => void;
  /** 调用方变更此值（递增）以触发整树重置（创建/删除后刷新） */
  reloadSeq?: number;
};

type TreeDataNode = DataNode & {
  orgCode: string;
  raw: OrganizationTreeNode;
};

const statusColorMap = Object.fromEntries(
  getOrganizationStatusOptions().map(o => [
    o.value,
    o.color === "success" ? "green" : o.color === "warning" ? "gold" : "default",
  ]),
) as Record<number, "green" | "gold" | "default">;

function renderTitle(node: OrganizationTreeNode): ReactNode {
  return (
    <span>
      <Badge color={statusColorMap[node.status] ?? "default"} />
      {" "}
      {node.orgName}
      <span style={{ color: "#999", marginLeft: 6 }}>
        (
        {node.orgCode}
        )
      </span>
    </span>
  );
}

function toDataNode(node: OrganizationTreeNode): TreeDataNode {
  return {
    key: node.orgCode,
    title: renderTitle(node),
    isLeaf: node.isLeaf,
    orgCode: node.orgCode,
    raw: node,
  };
}

function setNodeChildren(
  tree: TreeDataNode[],
  parentKey: string,
  children: TreeDataNode[],
): TreeDataNode[] {
  return tree.map((n) => {
    if (n.key === parentKey) {
      return { ...n, children };
    }
    if (n.children) {
      return {
        ...n,
        children: setNodeChildren(n.children as TreeDataNode[], parentKey, children),
      };
    }
    return n;
  });
}

export default function OrgTree({ loadChildren, selectedKey, onSelect, reloadSeq = 0 }: Props) {
  const [treeData, setTreeData] = useState<TreeDataNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const reloadRoots = useCallback(async () => {
    setLoading(true);
    try {
      const roots = await loadChildren(null);
      setTreeData(roots.map(toDataNode));
      setExpandedKeys([]);
    }
    finally {
      setLoading(false);
    }
  }, [loadChildren]);

  useEffect(() => {
    reloadRoots();
  }, [reloadRoots, reloadSeq]);

  const onLoadData = async (node: TreeDataNode) => {
    const children = await loadChildren(node.orgCode);
    setTreeData(prev => setNodeChildren(prev, node.orgCode, children.map(toDataNode)));
  };

  if (loading) {
    return <Spin />;
  }

  if (treeData.length === 0) {
    return <Empty description="暂无组织数据" />;
  }

  return (
    <Tree<TreeDataNode>
      blockNode
      showLine
      treeData={treeData}
      selectedKeys={selectedKey ? [selectedKey] : []}
      expandedKeys={expandedKeys}
      loadData={onLoadData}
      onExpand={keys => setExpandedKeys(keys as string[])}
      onSelect={(_, info) => {
        const node = info.node as TreeDataNode;
        onSelect(node.orgCode, node.raw);
      }}
    />
  );
}
