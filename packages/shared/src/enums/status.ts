export enum Status {
  Enable = 1,
  Pause,
  Disable,
}

export const statusToString: Record<Status, string> = {
  [Status.Enable]: "正常",
  [Status.Pause]: "暂停",
  [Status.Disable]: "结束",
};
