import shanghaiGasLogo from "@admin/assets/logo.png";
import AvatarDropdown from "@admin/components/RightContent/AvatarDropdown";
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BugOutlined,
  ClusterOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  ProfileOutlined,
  QuestionCircleOutlined,
  SafetyOutlined,
  SolutionOutlined,
  SwapOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { type MenuDataItem, ProLayout } from "@ant-design/pro-components";
import { isValidElement, useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useAccess } from "./admin-access";
import { type AdminManagementPath, getAdminRouteAccess, HR_MANUAL_PATH } from "./admin-route-registry";
import { useAdminSession } from "./admin-session";

type MenuRoute = MenuDataItem & {
  path: AdminManagementPath;
  children?: MenuRoute[];
};

const menu: MenuRoute[] = [
  { path: "/users", name: "用户管理", icon: <TeamOutlined /> },
  { path: "/organizations", name: "组织管理", icon: <ApartmentOutlined /> },
  {
    path: "/organization-responsibilities",
    name: "组织责任",
    icon: <ClusterOutlined />,
    children: [
      { path: "/organization-responsibilities/assignments", name: "责任任命" },
      { path: "/organization-responsibilities/types", name: "责任类型目录" },
    ],
  },
  { path: "/positions", name: "职位管理", icon: <SolutionOutlined /> },
  { path: "/employments", name: "雇佣关系", icon: <ProfileOutlined /> },
  { path: "/clients", name: "应用管理", icon: <AppstoreOutlined /> },
  { path: "/roles", name: "角色管理", icon: <SafetyOutlined /> },
  { path: "/sessions", name: "会话管理", icon: <HistoryOutlined /> },
  { path: "/delegations", name: "委托管理", icon: <SwapOutlined /> },
  { path: "/audit-logs", name: "审计日志", icon: <FileSearchOutlined /> },
  { path: "/system-logs", name: "系统日志", icon: <BugOutlined /> },
];

function visibleMenu(items: MenuRoute[], access: ReturnType<typeof useAccess>): MenuDataItem[] {
  return items
    .filter((item) => access[getAdminRouteAccess(item.path)])
    .map((item) => ({ ...item, children: item.children && visibleMenu(item.children, access) }));
}

function Brand() {
  return (
    <div className="iam-admin-brand">
      <img alt="上海燃气" className="iam-admin-brand-logo" src={shanghaiGasLogo} />
      <div className="iam-admin-brand-title">
        <span>IAM</span>
        <span>控制台</span>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAccess();
  const { currentUser } = useAdminSession();
  const username = currentUser?.username ?? "";
  const name = currentUser?.name || username;
  const displayName = username && name ? `${name}(${username})` : username;
  const route = useMemo(() => ({ path: "/", routes: visibleMenu(menu, access) }), [access]);

  return (
    <ProLayout
      route={route}
      location={location}
      title="上海燃气 IAM"
      logo={false}
      layout="mix"
      navTheme="light"
      splitMenus={false}
      siderWidth={256}
      fixSiderbar
      fixedHeader
      token={{ header: { heightLayoutHeader: 64 } }}
      headerTitleRender={() => <Brand />}
      menuHeaderRender={(_logo, _title, props) => (props?.isMobile === false ? null : <Brand />)}
      menu={{ locale: false }}
      onMenuHeaderClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        void navigate("/");
      }}
      menuItemRender={(item, dom) =>
        item.path && !item.children && item.path !== location.pathname ? <Link to={item.path}>{dom}</Link> : dom
      }
      itemRender={(item, _params, items) => {
        const label = item.title ?? item.breadcrumbName;
        return item.path && item.path !== items.at(-1)?.path ? (
          <Link to={item.path}>{label}</Link>
        ) : (
          <span>{label}</span>
        );
      }}
      actionsRender={() =>
        currentUser
          ? [
              <Link to={HR_MANUAL_PATH} key="help" className="iam-admin-help-link">
                <QuestionCircleOutlined aria-hidden />
                <span>使用帮助</span>
              </Link>,
            ]
          : []
      }
      avatarProps={{
        size: 32,
        style: { fontSize: 18 },
        title: displayName,
        children: name[0] ?? "",
        className: "iam-admin-user-avatar",
        render: (_, dom) => (isValidElement(dom) ? <AvatarDropdown>{dom}</AvatarDropdown> : dom),
      }}
    >
      <Outlet />
    </ProLayout>
  );
}
