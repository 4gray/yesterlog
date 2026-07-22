import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export interface CommandPaletteCommand {
  id: string;
  label: string;
  /** Right-aligned meta, e.g. a shortcut or the current value. */
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  commands: CommandPaletteCommand[];
  onClose: () => void;
}

export const COMMAND_PALETTE_PLACEHOLDER = "Log 2h on TBRO-352, go to week 28…";

const matches = (command: CommandPaletteCommand, query: string) => {
  const trimmed = query.trim().toLowerCase();
  return trimmed ? command.label.toLowerCase().includes(trimmed) : true;
};

/**
 * Command palette (⌘K).
 *
 * Stub: filters the given commands by plain substring and runs the highlighted
 * one. The design brief calls for natural-language input — "Log 2h on TBRO-352",
 * "go to week 28" — which is not implemented yet.
 *
 * TODO(nl-parsing): parse free-text time logging ("Log 2h on TBRO-352") into an
 * add-time prefill and open the existing modal with it pre-filled.
 * TODO(nl-parsing): parse relative/absolute week jumps ("go to week 28", "last
 * week") into a `goToWeek(date)` call.
 * TODO(nl-parsing): rank commands by fuzzy score rather than substring order,
 * and surface parsed intents above static commands.
 */
export const CommandPalette = ({ open, commands, onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Mirrors activeIndex so the window handler reads it without re-binding per
  // keypress. Written in an effect, never during render — a discarded render
  // must not publish an index the committed handler would act on.
  const activeIndexRef = useRef(0);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const visible = useMemo(() => commands.filter((command) => matches(command, query)), [commands, query]);
  const activeId = visible[activeIndex] ? `command-palette-option-${visible[activeIndex].id}` : undefined;

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Bound to the window, not the overlay: the palette is modal, and an
  // element-scoped handler stops firing as soon as focus leaves the input.
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (visible.length ? (current + 1) % visible.length : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (visible.length ? (current - 1 + visible.length) % visible.length : 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const command = visible[activeIndexRef.current];
        if (command && !command.disabled) {
          onClose();
          command.run();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, visible]);

  if (!open) {
    return null;
  }

  const runAt = (index: number) => {
    const command = visible[index];
    if (!command || command.disabled) {
      return;
    }
    onClose();
    command.run();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel command-palette-panel">
        <div className="command-palette-search">
          <Search size={14} strokeWidth={2} />
          {/* Focus stays in the input; the active row is announced via aria-activedescendant. */}
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder={COMMAND_PALETTE_PLACEHOLDER}
            aria-label="Run a command"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div id="command-palette-list" className="command-palette-list" role="listbox" aria-label="Commands">
          {visible.length === 0 ? (
            <div className="command-palette-empty" role="presentation">
              No matching commands
            </div>
          ) : (
            visible.map((command, index) => (
              <button
                key={command.id}
                id={`command-palette-option-${command.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={command.disabled}
                disabled={command.disabled}
                className={`command-palette-item${index === activeIndex ? " is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runAt(index)}
              >
                <span className="command-palette-item-label">{command.label}</span>
                {command.hint && <span className="command-palette-item-hint">{command.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
