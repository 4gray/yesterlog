import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  label: string;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const EDGE = 8;

/**
 * Minimal right-click menu rendered in a fixed portal at the pointer. Keyboard: arrows move,
 * Enter/Space select, Escape closes. Closes on outside pointerdown, scroll or resize. The
 * first enabled item takes focus so the menu is usable without a mouse once opened.
 */
export const ContextMenu = ({ label, x, y, items, onClose }: ContextMenuProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 0;
    const height = panel?.offsetHeight ?? 0;
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))
    });
  }, [x, y]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length === 0) {
      return;
    }
    const index = buttons.findIndex((button) => button === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    event.preventDefault();
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };

  return createPortal(
    <div
      ref={panelRef}
      className="ctx-menu"
      role="menu"
      aria-label={label}
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="ctx-menu-item"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon && (
            <span className="ctx-menu-icon" aria-hidden="true">
              {item.icon}
            </span>
          )}
          <span className="ctx-menu-label">{item.label}</span>
          {item.hint && <span className="ctx-menu-hint">{item.hint}</span>}
        </button>
      ))}
    </div>,
    document.body
  );
};
