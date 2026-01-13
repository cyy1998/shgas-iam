
export enum UserStatus {
    Enable = 1,
    Pause,
    Disable
}

export const userStatusToString: Record<UserStatus, string> = {
    [UserStatus.Enable]: "正常",
    [UserStatus.Pause]: "暂停",
    [UserStatus.Disable]: "结束",
};