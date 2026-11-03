import { ConfigProvider } from "antd";
import type { ReactNode } from "react";
import styles from "./DetailDrawer.module.less";

export default function DetailHeaderActions({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      componentSize="middle"
      button={{ autoInsertSpace: false }}
      theme={{
        token: { fontSize: 13, controlHeight: 32, borderRadius: 8 },
        components: { Button: { fontWeight: 400, paddingInline: 12, defaultShadow: "none", dangerShadow: "none" } },
      }}
    >
      <div className={styles["header-actions"]}>{children}</div>
    </ConfigProvider>
  );
}
