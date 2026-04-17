import { Button, Result } from 'antd';
import { history } from '@umijs/max';

export default function NoPermission() {
  return (
    <Result
      status="403"
      title="无访问权限"
      subTitle="您的账号没有访问管理后台的权限，请联系管理员。"
      extra={
        <Button type="primary" onClick={() => history.push('/')}>
          返回首页
        </Button>
      }
    />
  );
}
