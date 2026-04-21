export enum PositionStatus {
  Enable = 1,
  Pause,
  Disable,
}

export const positionStatusToString: Record<PositionStatus, string> = {
  [PositionStatus.Enable]: "正常",
  [PositionStatus.Pause]: "暂停",
  [PositionStatus.Disable]: "废除",
};

import type { StatusOption } from "./organization.status";

export function getPositionStatusOptions(): StatusOption[] {
  return [
    { label: "正常", value: PositionStatus.Enable, color: "success" },
    { label: "暂停", value: PositionStatus.Pause, color: "warning" },
    { label: "废除", value: PositionStatus.Disable, color: "default" },
  ];
}
