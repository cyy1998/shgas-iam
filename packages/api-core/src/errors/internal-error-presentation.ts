export function getInternalErrorMessage(requestId: string | undefined) {
  return requestId
    ? "服务器内部错误，请联系管理员并提供 requestId"
    : "服务器内部错误";
}
