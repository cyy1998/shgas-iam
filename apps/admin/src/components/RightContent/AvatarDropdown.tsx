import { logout } from '@admin/utils/auth';
import { LogoutOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import type { ReactElement } from 'react';

export default function AvatarDropdown({
  children,
}: {
  children: ReactElement;
}) {
  return (
    <Dropdown
      menu={{
        items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }],
        onClick: ({ key }) => {
          if (key === 'logout') logout();
        },
      }}
    >
      {children}
    </Dropdown>
  );
}
