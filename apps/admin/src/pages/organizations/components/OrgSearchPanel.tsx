import StatusTag from '@admin/components/StatusTag';
import {
  type OrganizationVo,
  searchOrganizations,
} from '@admin/services/organization';
import { Empty, Input, List, Spin } from 'antd';
import { useEffect, useState } from 'react';

type Props = {
  onSelect: (orgCode: string) => void;
};

export default function OrgSearchPanel({ onSelect }: Props) {
  const [keyword, setKeyword] = useState('');
  const text = keyword.trim();

  return (
    <div>
      <Input.Search
        placeholder="搜索组织名称或编码"
        allowClear
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      {text ? (
        <OrgSearchResults
          key={keyword}
          text={text}
          onSelect={(orgCode) => {
            onSelect(orgCode);
            setKeyword('');
          }}
        />
      ) : null}
    </div>
  );
}

type ResultsProps = {
  text: string;
  onSelect: (orgCode: string) => void;
};

function OrgSearchResults({ text, onSelect }: ResultsProps) {
  const [results, setResults] = useState<OrganizationVo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await searchOrganizations({
          pageNum: 1,
          pageSize: 15,
          conditions: {
            fuzzyConditions: { text },
            exactConditions: {},
          },
        });
        if (!cancelled) setResults(data.result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <div
      style={{
        marginTop: 8,
        maxHeight: 240,
        overflowY: 'auto',
        border: '1px solid #f0f0f0',
      }}
    >
      {loading ? (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      ) : results.length === 0 ? (
        <Empty
          style={{ padding: 12 }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="无匹配结果"
        />
      ) : (
        <List<OrganizationVo>
          size="small"
          dataSource={results}
          renderItem={(r) => (
            <List.Item
              style={{ cursor: 'pointer', padding: '6px 12px' }}
              onClick={() => onSelect(r.orgCode)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                  alignItems: 'center',
                }}
              >
                <span>
                  {r.orgName}
                  <span style={{ color: '#999', marginLeft: 6 }}>
                    ({r.orgCode})
                  </span>
                </span>
                <StatusTag domain="org" status={r.status} />
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
