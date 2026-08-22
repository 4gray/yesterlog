import { useEffect } from "react";
import { getVisibleNavViews, type AppView } from "../components/Sidebar";

interface UseViewShortcutsOptions {
  enabled: boolean;
  showReview: boolean;
  onViewChange: (view: AppView) => void;
}

/**
 * ⌘1…⌘9 (Ctrl on non-mac) jump to the sidebar views in their visible order,
 * matching the numbering shown in the command palette's "Go to" entries.
 */
export const useViewShortcuts = ({ enabled, showReview, onViewChange }: UseViewShortcutsOptions) => {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.metaKey && !event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }
      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
        return;
      }
      const target = getVisibleNavViews(showReview)[digit - 1];
      if (!target) {
        return;
      }
      event.preventDefault();
      onViewChange(target.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, showReview, onViewChange]);
};
