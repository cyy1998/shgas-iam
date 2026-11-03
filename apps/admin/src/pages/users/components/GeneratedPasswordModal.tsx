import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { Modal, Typography, theme } from "antd";
import type { ReactNode } from "react";

type Options = {
  title: string;
  password: string;
  extra?: ReactNode;
};

function GeneratedPasswordContent({ password, extra }: Pick<Options, "password" | "extra">) {
  const { token } = theme.useToken();

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        请复制密码并转交给用户，关闭后将不再显示。
      </Typography.Paragraph>
      <div
        style={{
          padding: "10px 12px",
          background: token.colorPrimaryBg,
          border: `1px solid ${token.colorPrimaryBorder}`,
          borderRadius: token.borderRadiusLG,
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          用户密码
        </Typography.Text>
        <Typography.Paragraph
          copyable={{
            text: password,
            tooltips: ["复制密码", "已复制"],
            icon: [
              <span key="copy" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CopyOutlined />
                复制密码
              </span>,
              <span key="copied" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CheckOutlined />
                已复制
              </span>,
            ],
          }}
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px 12px",
            margin: "4px 0 0",
          }}
          styles={{
            actions: { flexShrink: 0, marginInlineStart: 0 },
            action: {
              padding: "4px 8px",
              color: token.colorPrimaryText,
              fontSize: 13,
              background: token.colorBgContainer,
              border: `1px solid ${token.colorPrimaryBorder}`,
              borderRadius: token.borderRadius,
            },
          }}
        >
          <span
            style={{
              flex: "1 1 160px",
              minWidth: 0,
              fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.4,
              letterSpacing: "0.04em",
              overflowWrap: "anywhere",
              whiteSpace: "pre-wrap",
              userSelect: "all",
            }}
          >
            {password}
          </span>
        </Typography.Paragraph>
      </div>
      {extra && <div style={{ marginTop: 12 }}>{extra}</div>}
    </div>
  );
}

export function showGeneratedPassword({ title, password, extra }: Options) {
  Modal.info({
    title,
    width: 480,
    content: <GeneratedPasswordContent password={password} extra={extra} />,
    okText: "我已复制",
  });
}
