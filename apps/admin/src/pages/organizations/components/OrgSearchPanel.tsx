import StatusTag from '@/components/StatusTag';
import {
  type OrganizationVo,
  searchOrganizations,
} from '@/services/organization';
import { Empty, Input, List, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';

type Props = {
  onSelect: (orgCode: string) => void;
};

export default function OrgSearchPanel({ onSelect }: Props) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<OrganizationVo[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const text = keyword.trim();
    if (text.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const mySeq = ++seqRef.current;
    setLoading(true);
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
        if (mySeq !== seqRef.current) return; // outdated
        setResults(data.result);
      } finally {
        if (mySeq === seqRef.current) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword]);

  const showResults = keyword.trim().length > 0;

  return (
    <div>
      <Input.Search
        placeholder="搜索组织名称或编码"
        allowClear
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      {showResults && (
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
                  onClick={() => {
                    onSelect(r.orgCode);
                    setKeyword('');
                  }}
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
      )}
    </div>
  );
}
