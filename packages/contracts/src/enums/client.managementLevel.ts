export enum ClientManagementLevel {
  Independent = "Independent",
  Gateway = "Gateway",
  None = "None",
}

export const clientManagementLevelToString: Record<ClientManagementLevel, string> = {
  [ClientManagementLevel.Independent]: "独立应用",
  [ClientManagementLevel.Gateway]: "网关托管",
  [ClientManagementLevel.None]: "无",
};

export function getClientManagementLevelOptions(): { label: string; value: ClientManagementLevel }[] {
  return [
    { label: "独立应用", value: ClientManagementLevel.Independent },
    { label: "网关托管", value: ClientManagementLevel.Gateway },
    { label: "无", value: ClientManagementLevel.None },
  ];
}
