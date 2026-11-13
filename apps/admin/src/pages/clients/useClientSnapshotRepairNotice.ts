import { useCallback, useSyncExternalStore } from "react";

const repairNoticeChanges = new EventTarget();

export function useClientSnapshotRepairNotice(clientCode: string) {
  const key = `client-sso-repair:${clientCode}`;
  const subscribe = useCallback(
    (listener: () => void) => {
      repairNoticeChanges.addEventListener(key, listener);
      return () => repairNoticeChanges.removeEventListener(key, listener);
    },
    [key],
  );
  const getNotice = useCallback(() => sessionStorage.getItem(key), [key]);
  const notice = useSyncExternalStore(subscribe, getNotice);
  const remember = useCallback(
    (value: string) => {
      sessionStorage.setItem(key, value);
      repairNoticeChanges.dispatchEvent(new Event(key));
    },
    [key],
  );
  return [notice, remember] as const;
}
