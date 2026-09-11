import { LogoutOutlined } from '@ant-design/icons';
import logo from '@sso/assets/logo.png';
import { buildLogoutUrl } from '@sso/lib/sso';
import { getQuery } from '@sso/utils/url';
import { useModel } from '@umijs/max';
import { Avatar, Dropdown, message } from 'antd';

export default function TopBar() {
  const { authConfig, userInfo } = useModel('sso');

  const handleLogout = () => {
    const client = getQuery('client') ?? '';
    const redirectUrl = getQuery('redirectUrl') ?? '';
    if (!authConfig) {
      message.error('SSO 配置未就绪，请刷新重试');
      return;
    }
    window.location.href = buildLogoutUrl(authConfig, redirectUrl, client);
  };

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <img className="topbar-logo" src={logo} alt="上海燃气" />
        <div>
          <div className="topbar-title">上海燃气身份认证平台</div>
          <div className="topbar-subtitle">SHANGHAI GAS IAM</div>
        </div>
      </div>
      {userInfo && (
        <Dropdown
          menu={{
            items: [
              {
                key: 'logout',
                label: (
                  <span className="logout-text">
                    <LogoutOutlined />
                    退出登录
                  </span>
                ),
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
              size={32}
              style={{
                backgroundColor: '#1560d1',
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {userInfo.profile?.name?.[0] ?? ''}
            </Avatar>
            <span className="topbar-user-name">
              {userInfo.profile?.name ?? ''}
            </span>
          </div>
        </Dropdown>
      )}
    </div>
  );
}
