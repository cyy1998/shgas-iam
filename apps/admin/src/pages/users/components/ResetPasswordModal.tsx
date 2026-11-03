import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { resetUserPassword } from "@admin/services/user";
import { Modal, message, Typography } from "antd";
import { showGeneratedPassword } from "./GeneratedPasswordModal";

type Args = {
  username: string;
  name?: string;
  onSuccess: () => Promise<void>;
  onCommitted: (error: AdminMutationCommittedError) => Promise<void>;
};

export function confirmResetPassword({ username, name, onSuccess, onCommitted }: Args) {
  Modal.confirm({
    title: `重置 ${name ?? username} 的密码？`,
    content: "确认后将生成新的随机密码，请做好交接准备。",
    okType: "danger",
    okText: "重置",
    onOk: async () => {
      try {
        const outcome = await resetUserPassword(username);
        showGeneratedPassword({
          title: "新密码已生成",
          password: outcome.result,
          extra: outcome.sessions && (
            <Typography.Text
              type={outcome.sessions.failed || outcome.sessions.unknown ? "warning" : "secondary"}
              style={{ fontSize: 13 }}
            >
              已终止 {outcome.sessions.userSessionsTerminated} 个根会话、
              {outcome.sessions.clientSessionsTerminated} 个应用会话；保留 {outcome.sessions.excluded} 个当前根。
              {(outcome.sessions.failed > 0 || outcome.sessions.unknown > 0) &&
                `失败 ${outcome.sessions.failed} 项，结果未知 ${outcome.sessions.unknown} 项，请刷新确认。`}
            </Typography.Text>
          ),
        });
        await onSuccess();
      } catch (err) {
        if (err instanceof AdminMutationCommittedError) {
          await onCommitted(err);
          return;
        }
        message.error(err instanceof Error ? err.message : "重置失败");
      }
    },
  });
}
