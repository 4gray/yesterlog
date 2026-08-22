// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AddTimeDurationPicker,
  type AddTimeDurationPickerProps,
  type DurationPreset
} from "./AddTimeDurationPicker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const presets: DurationPreset[] = [
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 }
];

let container: HTMLDivElement;
let root: Root;

const noop = () => undefined;

const baseProps = (): AddTimeDurationPickerProps => ({
  seconds: 2 * 60 * 60,
  presets,
  valueClassName: "modal-duration",
  customMode: "preset",
  customAmount: "2",
  customUnit: "h",
  customAmountLabel: "Custom duration amount",
  onPreset: noop,
  onCustomOpen: noop,
  onCustomAmountChange: noop,
  onCustomAmountBlur: noop,
  onCustomUnitChange: noop
});

const renderPicker = (props: Partial<AddTimeDurationPickerProps> = {}) => {
  act(() => {
    root.render(<AddTimeDurationPicker {...baseProps()} {...props} />);
  });
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AddTimeDurationPicker", () => {
  it("renders formatted duration and marks the matching preset active", () => {
    renderPicker();

    expect(container.querySelector(".modal-duration")?.textContent).toBe("2h 00m");
    expect(container.querySelector<HTMLButtonElement>(".preset.active")?.textContent).toBe("2h");
    expect(container.querySelector(".custom-duration")).toBeNull();
  });

  it("passes preset and custom-open actions through", () => {
    const onPreset = vi.fn();
    const onCustomOpen = vi.fn();
    renderPicker({ onPreset, onCustomOpen });

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>(".preset"))
        .find((button) => button.textContent === "1h")
        ?.click();
      Array.from(container.querySelectorAll<HTMLButtonElement>(".preset"))
        .find((button) => button.textContent === "Custom")
        ?.click();
    });

    expect(onPreset).toHaveBeenCalledWith(60 * 60);
    expect(onCustomOpen).toHaveBeenCalledTimes(1);
  });

  it("renders custom controls and passes amount, blur, and unit changes through", () => {
    const onCustomAmountChange = vi.fn();
    const onCustomAmountBlur = vi.fn();
    const onCustomUnitChange = vi.fn();
    renderPicker({
      customMode: "custom",
      customAmount: "1.5",
      customUnit: "d",
      onCustomAmountChange,
      onCustomAmountBlur,
      onCustomUnitChange
    });

    const input = container.querySelector<HTMLInputElement>(".custom-duration-input");
    expect(input?.value).toBe("1.5");
    expect(input?.getAttribute("aria-label")).toBe("Custom duration amount");
    expect(container.querySelector(".custom-duration-hint")?.textContent).toBe("1D = 8h · 1W = 40h");
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>(".custom-unit-toggle button"))
        .find((button) => button.textContent === "D")
        ?.getAttribute("aria-pressed")
    ).toBe("true");

    act(() => {
      if (input) {
        setInputValue(input, "2.25");
        input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      }
      Array.from(container.querySelectorAll<HTMLButtonElement>(".custom-unit-toggle button"))
        .find((button) => button.textContent === "W")
        ?.click();
    });

    expect(onCustomAmountChange).toHaveBeenCalledWith("2.25");
    expect(onCustomAmountBlur).toHaveBeenCalledTimes(1);
    expect(onCustomUnitChange).toHaveBeenCalledWith("w");
  });

  it("uses an exact-minute control instead of decimal custom units when supplied", () => {
    const onChange = vi.fn();
    renderPicker({
      seconds: 35 * 60,
      customMode: "custom",
      exactMinutes: {
        value: 35,
        label: "Exact personal note duration in minutes",
        onChange
      }
    });

    const input = container.querySelector<HTMLInputElement>(".exact-duration-control input");
    expect(input?.value).toBe("35");
    expect(input?.getAttribute("aria-label")).toBe("Exact personal note duration in minutes");
    expect(container.querySelector(".exact-duration-control.active")).not.toBeNull();
    expect(container.querySelector(".custom-duration")).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Custom")).toBe(false);

    act(() => {
      if (input) {
        setInputValue(input, "50");
      }
    });

    expect(onChange).toHaveBeenCalledWith(50);
  });
});
