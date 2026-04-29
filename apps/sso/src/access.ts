// 当前 sso 应用所有路由都允许匿名访问；user-info 页通过 useModel 加载用户信息，
// 401 由 utils/request.ts 自动跳转到 /login。保留 access 文件仅满足 UMI Max
// `access` 插件的运行时要求，不真正限流。
export default function access() {
  return {};
}
