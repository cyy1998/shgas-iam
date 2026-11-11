import { createContext, useContext } from "react";
import access from "./access";

export const AdminAccessContext = createContext(access({}));

export function useAccess() {
  return useContext(AdminAccessContext);
}
