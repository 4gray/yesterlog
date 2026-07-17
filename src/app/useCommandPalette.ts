import { useCallback, useEffect, useState } from "react";

/**
 * Owns `commandPaletteOpen` and the global ⌘K / Ctrl+K binding.
 *
 * ⌘K used to open the retrospective add-time modal; that flow moved to ⌘⇧K
 * (see `useAddTimeModalActions`) and is also reachable as a palette command.
 */
export const useCommandPalette = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      // ⌘⇧K belongs to the add-time shortcut; only bare ⌘K opens the palette.
      if (event.shiftKey) {
        return;
      }

      event.preventDefault();
      toggle();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, toggle]);

  useEffect(() => {
    if (!enabled && open) {
      setOpen(false);
    }
  }, [enabled, open]);

  return { open, close, toggle };
};
