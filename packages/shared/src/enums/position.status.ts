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
