import logo from '@/assets/logo.png';
import { buildLogoutUrl } from '@/lib/sso';
import { decodeRedirect, getQuery } from '@/utils/url';
import { useModel } from '@umijs/max';
import { Avatar, Dropdown, message } from 'antd';

export default function TopBar() {
  const { authConfig, userInfo } = useModel('sso');

  const handleLogout = () => {
    const client = getQuery('client') ?? '';
    const redirectUrl = decodeRedirect(getQuery('redirectUrl')) ?? '';
    if (!authConfig) {
      message.error('SSO 配置未就绪，请刷新重试');
      return;
    }
    window.location.href = buildLogoutUrl(authConfig, redirectUrl, client);
  };

  return (
    <div className="topbar">
      <img className="topbar-logo" src={logo} alt="logo" />
      {userInfo && (
        <Dropdown
          menu={{
            items: [
              {
                key: 'logout',
                label: <span style={{ color: '#ff1313' }}>退出登录</span>,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'logout') handleLogout();
            },
          }}
          placement="bottomRight"
        >
          <div className="topbar-user">
            <Avatar
              size="small"
              style={{
                backgroundColor: '#1560d1',
                marginRight: 8,
              }}
            >
              {userInfo.name?.[0] ?? ''}
            </Avatar>
            {userInfo.name}
          </div>
        </Dropdown>
      )}
    </div>
  );
}
