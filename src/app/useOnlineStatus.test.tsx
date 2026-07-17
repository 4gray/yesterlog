// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOnlineStatus } from "./useOnlineStatus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Harness = () => {
  const isOnline = useOnlineStatus();
  return <span data-online={isOnline}>{isOnline ? "online" : "offline"}</span>;
};

let container: HTMLDivElement;
let root: Root;

const setNavigatorOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
};

const state = () => container.querySelector("span")?.dataset.online;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setNavigatorOnline(true);
});

describe("useOnlineStatus", () => {
  it("starts from navigator.onLine", () => {
    setNavigatorOnline(false);
    act(() => root.render(<Harness />));
    expect(state()).toBe("false");
  });

  it("follows offline and online events", () => {
    act(() => root.render(<Harness />));
    expect(state()).toBe("true");

    act(() => window.dispatchEvent(new Event("offline")));
    expect(state()).toBe("false");

    act(() => window.dispatchEvent(new Event("online")));
    expect(state()).toBe("true");
  });

  it("treats an unknown navigator.onLine as online", () => {
    Object.defineProperty(window.navigator, "onLine", { value: undefined, configurable: true });
    act(() => root.render(<Harness />));
    expect(state()).toBe("true");
  });
});
