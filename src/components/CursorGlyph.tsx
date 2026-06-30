interface CursorGlyphProps {
  size?: number;
  className?: string;
}

/**
 * A small isometric-cube mark that nods to the Cursor logo. Strokes use
 * `currentColor`, so it inherits the button's text color in both themes.
 */
export const CursorGlyph = ({ size = 14, className }: CursorGlyphProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <path
      d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M12 12V2.5M12 12 20.5 7M12 12 3.5 7"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinejoin="round"
      opacity={0.55}
    />
  </svg>
);
