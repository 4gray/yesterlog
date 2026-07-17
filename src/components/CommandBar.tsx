import { Search } from "lucide-react";
import { COMMAND_PALETTE_PLACEHOLDER } from "./CommandPalette";

interface CommandBarProps {
  onOpen: () => void;
  /** Rendered in the kbd chip; Ctrl on Windows/Linux. */
  shortcutLabel: string;
}

/**
 * The ⌘K affordance in the actions row. Deliberately a button, not an input —
 * typing happens in the palette overlay, this only triggers it.
 */
export const CommandBar = ({ onOpen, shortcutLabel }: CommandBarProps) => (
  <button type="button" className="command-bar" onClick={onOpen} aria-label="Open command palette">
    <Search size={13} strokeWidth={2} />
    <span className="command-bar-placeholder">{COMMAND_PALETTE_PLACEHOLDER}</span>
    <span className="command-bar-kbd">{shortcutLabel}</span>
  </button>
);
