import { formatClock } from "../utils/date";
import type { JiraDurationUnit } from "../utils/date";

export type DurationMode = "preset" | "custom";
export type DurationUnit = JiraDurationUnit;

export interface DurationPreset {
  label: string;
  seconds: number;
}

export interface ExactDurationMinutes {
  value: number;
  label: string;
  onChange: (minutes: number) => void;
}

const CUSTOM_UNITS: Array<{ unit: DurationUnit; label: string }> = [
  { unit: "h", label: "H" },
  { unit: "d", label: "D" },
  { unit: "w", label: "W" }
];

export interface AddTimeDurationPickerProps {
  seconds: number;
  presets: DurationPreset[];
  valueClassName: string;
  customMode: DurationMode;
  customAmount: string;
  customUnit: DurationUnit;
  customAmountLabel: string;
  exactMinutes?: ExactDurationMinutes;
  onPreset: (seconds: number) => void;
  onCustomOpen: () => void;
  onCustomAmountChange: (amount: string) => void;
  onCustomAmountBlur: () => void;
  onCustomUnitChange: (unit: DurationUnit) => void;
}

export const AddTimeDurationPicker = ({
  seconds,
  presets,
  valueClassName,
  customMode,
  customAmount,
  customUnit,
  customAmountLabel,
  exactMinutes,
  onPreset,
  onCustomOpen,
  onCustomAmountChange,
  onCustomAmountBlur,
  onCustomUnitChange
}: AddTimeDurationPickerProps) => (
  <div className="duration-picker">
    <div className={valueClassName}>{formatClock(seconds)}</div>
    <div className="modal-presets">
      {presets.map((preset) => (
        <button
          type="button"
          key={preset.label}
          className={`preset ${customMode === "preset" && preset.seconds === seconds ? "active" : ""}`}
          onClick={() => onPreset(preset.seconds)}
        >
          {preset.label}
        </button>
      ))}
      {exactMinutes ? (
        <label className={`exact-duration-control ${customMode === "custom" ? "active" : ""}`}>
          <span>Exact</span>
          <input
            type="number"
            min={5}
            step={5}
            inputMode="numeric"
            value={exactMinutes.value}
            onChange={(event) => exactMinutes.onChange(Math.max(5, Number(event.target.value) || 0))}
            aria-label={exactMinutes.label}
          />
          <em>min</em>
        </label>
      ) : (
        <button type="button" className={`preset ${customMode === "custom" ? "active" : ""}`} onClick={onCustomOpen}>
          Custom
        </button>
      )}
    </div>
    {!exactMinutes && customMode === "custom" && (
      <div className="custom-duration">
        <input
          className="custom-duration-input"
          type="number"
          min="0.25"
          step="0.25"
          inputMode="decimal"
          value={customAmount}
          onChange={(event) => onCustomAmountChange(event.target.value)}
          onBlur={onCustomAmountBlur}
          aria-label={customAmountLabel}
        />
        <div className="custom-unit-toggle" aria-label="Custom duration unit">
          {CUSTOM_UNITS.map((unit) => (
            <button
              type="button"
              key={unit.unit}
              className={customUnit === unit.unit ? "active" : ""}
              aria-pressed={customUnit === unit.unit}
              onClick={() => onCustomUnitChange(unit.unit)}
            >
              {unit.label}
            </button>
          ))}
        </div>
        <span className="custom-duration-hint">1D = 8h · 1W = 40h</span>
      </div>
    )}
  </div>
);
