import "antd/dist/reset.css";
import "./global.less";
import { ConfigProvider } from "antd";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { adminRoutes } from "./routes";
import { adminTheme } from "./theme";
import { restoreLoginRedirectState } from "./utils/auth";

restoreLoginRedirectState();

ConfigProvider.config({
  holderRender: (children) => children,
  theme: adminTheme,
});

const router = createBrowserRouter(adminRoutes, { basename: import.meta.env.BASE_URL });
const root = document.getElementById("root");
if (!root) throw new Error("Admin root element is missing");

createRoot(root).render(
  <ConfigProvider theme={adminTheme}>
    <RouterProvider router={router} />
  </ConfigProvider>,
);
