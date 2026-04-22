import type { OrganizationTreeNode } from "@/services/organization";
import { getOrganizationStatusOptions } from "@iam/shared";
import { Badge, Input, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { useMemo, useState } from "react";

type Props = {
  data: OrganizationTreeNode[];
  selectedKey?: string;
  onSelect: (orgCode: string, node: OrganizationTreeNode) => void;
};

type TreeDataNode = DataNode & {
  orgCode: string;
  raw: OrganizationTreeNode;
};

const statusColorMap = Object.fromEntries(
  getOrganizationStatusOptions().map((o) => [
    o.value,
    o.color === "success" ? "green" : o.color === "warning" ? "gold" : "default",
  ]),
) as Record<number, "green" | "gold" | "default">;

function toDataNode(node: OrganizationTreeNode, keyword: string): TreeDataNode {
  const matched = keyword
    && (node.orgName.includes(keyword) || node.orgCode.includes(keyword));
  const title = (
    <span style={{ fontWeight: matched ? 600 : 400 }}>
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
  return {
    key: node.orgCode,
    title,
    orgCode: node.orgCode,
    raw: node,
    children: node.children.map((c: OrganizationTreeNode) => toDataNode(c, keyword)),
  };
}

function collectMatchedKeys(
  nodes: OrganizationTreeNode[],
  keyword: string,
  acc: string[] = [],
): string[] {
  for (const n of nodes) {
    const hit = n.orgName.includes(keyword) || n.orgCode.includes(keyword);
    if (hit) {
      acc.push(n.orgCode);
    }
    if (n.children.length > 0) {
      collectMatchedKeys(n.children, keyword, acc);
    }
  }
  return acc;
}

function collectAncestorKeys(
  nodes: OrganizationTreeNode[],
  targets: Set<string>,
  path: string[] = [],
  acc: Set<string> = new Set(),
): Set<string> {
  for (const n of nodes) {
    const nextPath = [...path, n.orgCode];
    if (targets.has(n.orgCode)) {
      path.forEach((k) => acc.add(k));
    }
    if (n.children.length > 0) {
      collectAncestorKeys(n.children, targets, nextPath, acc);
    }
  }
  return acc;
}

export default function OrgTree({ data, selectedKey, onSelect }: Props) {
  const [keyword, setKeyword] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [autoExpand, setAutoExpand] = useState(true);

  const treeData = useMemo(() => data.map((n) => toDataNode(n, keyword)), [data, keyword]);

  const computedExpanded = useMemo(() => {
    if (!keyword) return expandedKeys;
    const matched = new Set(collectMatchedKeys(data, keyword));
    const ancestors = collectAncestorKeys(data, matched);
    return Array.from(new Set([...ancestors, ...matched]));
  }, [keyword, data, expandedKeys]);

  return (
    <div>
      <Input.Search
        placeholder="搜索组织名称或编码"
        allowClear
        onChange={(e) => {
          setKeyword(e.target.value);
          setAutoExpand(true);
        }}
        style={{ marginBottom: 8 }}
      />
      <Tree<TreeDataNode>
        blockNode
        showLine
        treeData={treeData}
        selectedKeys={selectedKey ? [selectedKey] : []}
        expandedKeys={computedExpanded}
        autoExpandParent={autoExpand}
        onExpand={(keys) => {
          setExpandedKeys(keys as string[]);
          setAutoExpand(false);
        }}
        onSelect={(_, info) => {
          const node = info.node as TreeDataNode;
          onSelect(node.orgCode, node.raw);
        }}
      />
    </div>
  );
}
