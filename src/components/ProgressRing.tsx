interface ProgressRingProps {
  /** Progress as a percentage (0–100). Values outside the range are clamped. */
  pct: number;
  size?: number;
  radius?: number;
  stroke?: number;
  color?: string;
  ariaLabel?: string;
  showLabel?: boolean;
  /** `.ring` fixes the box at 78px, so any non-default `size` needs a class that resizes it. */
  className?: string;
}

/**
 * Circular progress ring used in the time-budget headers (Week, Month, Today,
 * Reports). Renders the `.ring` wrapper with a centered percentage label so the
 * SVG geometry lives in one place instead of being duplicated per header.
 */
export const ProgressRing = ({
  pct,
  size = 78,
  radius = 33,
  stroke = 7,
  color = "var(--blue)",
  ariaLabel,
  showLabel = true,
  className
}: ProgressRingProps) => {
  const clamped = Math.max(0, Math.min(pct, 100));
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <div
      className={`ring${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? `${Math.round(clamped)} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      {showLabel && (
        <div className="ring-label">
          {Math.round(clamped)}
          <span className="ring-pct">%</span>
        </div>
      )}
    </div>
  );
};
