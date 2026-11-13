import { ClientCodeSchema } from "@iam/contracts";
import { clientStatus } from "@sso/services/open";
import { Card, Typography } from "antd";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import "./index.less";

export default function ApplicationAccessDeniedPage() {
  const [params] = useSearchParams();
  const clientCode = params.get("client");
  const [application, setApplication] = useState<{ code: string; name: string }>();

  useEffect(() => {
    const client = ClientCodeSchema.safeParse(clientCode);
    if (!client.success) return;

    const request = new AbortController();
    void clientStatus({ clientCode: client.data }, { suppressErrorMessage: true, signal: request.signal })
      .then((data) => {
        const name = data?.clientName?.trim();
        if (!request.signal.aborted && data?.clientCode === client.data && name) {
          setApplication({ code: client.data, name });
        }
      })
      .catch(() => {});
    return () => request.abort();
  }, [clientCode]);

  return (
    <main className="application-access-denied">
      <Card>
        <Typography.Title level={1}>无权限访问应用</Typography.Title>
        {application?.code === clientCode && <Typography.Title level={2}>{application.name}</Typography.Title>}
        <Typography.Paragraph>你没有权限访问此应用，请联系管理员</Typography.Paragraph>
      </Card>
    </main>
  );
}
