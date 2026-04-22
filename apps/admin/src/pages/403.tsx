import { logout } from '@/utils/auth';
import { Button, Result } from 'antd';

export default function NoPermission() {
  return (
    <Result
      status="403"
      title="无访问权限"
      subTitle="您的账号没有访问管理后台的权限，请联系管理员或切换账号。"
      extra={
        <Button type="primary" onClick={logout}>
          退出登录
        </Button>
      }
    />
  );
}
