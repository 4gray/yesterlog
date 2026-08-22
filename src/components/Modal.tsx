import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  /** Accessible dialog name (aria-label). */
  label: string;
  onClose: () => void;
  /** Extra class(es) on .modal-panel, e.g. "add-time-modal-panel". */
  panelClassName?: string;
  /** Set false when the consumer owns the Escape key (e.g. nested pickers). */
  closeOnEscape?: boolean;
  children: ReactNode;
}

/**
 * The one dialog shell: renders the .modal-overlay / .modal-backdrop /
 * .modal-panel convention (position: fixed, so it renders in place), closes
 * on Escape and backdrop click, traps Tab focus inside the panel and
 * restores focus on unmount.
 */
export const Modal = ({ label, onClose, panelClassName, closeOnEscape = true, children }: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;

    // Respect autoFocus inside the panel; otherwise focus the panel itself.
    if (panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector<HTMLElement>("[autofocus]") ?? panel;
      target.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab" && panel) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !panel.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    // Window, not document: modal keys must fire no matter where focus sits.
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [onClose, closeOnEscape]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={label}>
      <div className="modal-backdrop" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={panelClassName ? `modal-panel ${panelClassName}` : "modal-panel"}>
        {children}
      </div>
    </div>
  );
};
