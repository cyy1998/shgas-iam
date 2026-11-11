import { Modal } from "antd";
import { useEffect, useEffectEvent } from "react";
import { useBlocker } from "react-router";

export function useClientDraftGuard(shouldBlock: () => boolean, discard: () => void) {
  const blocker = useBlocker(shouldBlock);
  const discardDraft = useEffectEvent(discard);

  useEffect(() => {
    if (!shouldBlock()) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldBlock()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [shouldBlock]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const dialog = Modal.confirm({
      title: "放弃未保存的修改？",
      content: "当前分区的修改不会自动保存或保留草稿。",
      okText: "放弃修改",
      okType: "danger",
      onOk: () => {
        discardDraft();
        blocker.proceed();
      },
      onCancel: () => blocker.reset(),
    });
    return () => dialog.destroy();
  }, [blocker]);
}
