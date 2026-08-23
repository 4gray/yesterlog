// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeMode } from "../components/Sidebar";
import { THEME_STORAGE_KEY, useThemeMode } from "./useThemeMode";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ThemeApi = ReturnType<typeof useThemeMode>;

let container: HTMLDivElement;
let root: Root;
let api: ThemeApi | undefined;

function Harness({ initialTheme, persist }: { initialTheme?: ThemeMode; persist?: boolean }) {
  api = useThemeMode({ initialTheme, persist });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Theme hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: { initialTheme?: ThemeMode; persist?: boolean } = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const installMatchMedia = (matches: boolean) => {
  let currentMatches = matches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    media: "(prefers-color-scheme: light)",
    get matches() {
      return currentMatches;
    },
    addEventListener: vi.fn((eventName: string, listener: (event: MediaQueryListEvent) => void) => {
      if (eventName === "change") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((eventName: string, listener: (event: MediaQueryListEvent) => void) => {
      if (eventName === "change") {
        listeners.delete(listener);
      }
    })
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQueryList)
  });

  return {
    setMatches(next: boolean) {
      currentMatches = next;
      const event = { matches: next, media: mediaQueryList.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
    mediaQueryList
  };
};

beforeEach(() => {
  api = undefined;
  localStorage.clear();
  document.documentElement.classList.remove("theme-light", "theme-dark");
  installMatchMedia(false);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove("theme-light", "theme-dark");
});

describe("useThemeMode", () => {
  it("loads the primary stored theme and persists explicit selections", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    renderHarness();

    expect(getApi().selectedTheme).toBe("light");
    expect(getApi().effectiveTheme).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);

    act(() => getApi().selectTheme("dark"));

    expect(getApi().selectedTheme).toBe("dark");
    expect(getApi().effectiveTheme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
  });

  it("falls back to the legacy stored theme key", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    renderHarness();

    expect(getApi().selectedTheme).toBe("dark");
    expect(getApi().effectiveTheme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
  });

  it("applies the resolved class when following the system preference", () => {
    installMatchMedia(true);

    renderHarness();

    expect(getApi().selectedTheme).toBeNull();
    expect(getApi().effectiveTheme).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
  });

  it("updates the effective theme when the system preference changes", () => {
    const media = installMatchMedia(false);
    renderHarness();

    expect(getApi().effectiveTheme).toBe("dark");

    act(() => media.setMatches(true));

    expect(getApi().selectedTheme).toBeNull();
    expect(getApi().effectiveTheme).toBe("light");
  });

  it("does not persist demo theme changes when persistence is disabled", () => {
    renderHarness({ initialTheme: "dark", persist: false });

    expect(getApi().selectedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);

    act(() => getApi().selectTheme("light"));

    expect(getApi().selectedTheme).toBe("light");
    expect(getApi().effectiveTheme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
  });
});
