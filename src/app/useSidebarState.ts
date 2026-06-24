import { useCallback, useState } from "react";

export const useSidebarState = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => !current);
  }, []);

  return {
    sidebarCollapsed,
    toggleSidebarCollapsed
  };
};
