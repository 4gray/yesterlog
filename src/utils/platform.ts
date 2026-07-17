/**
 * Apple platforms label the command key ⌘; everywhere else the same handlers
 * fire on Ctrl. Only affects how shortcuts are *rendered* — the key handlers
 * accept either modifier.
 */
export const isApplePlatform = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const modern = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const platform = modern || navigator.platform || navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
};

/**
 * "⌘K" / "Ctrl+K", or with `shift`, "⌘⇧K" / "Ctrl+Shift+K". Each platform gets
 * its own notation — never a ⇧ glyph next to a spelled-out Ctrl.
 */
export const formatShortcut = (key: string, { shift = false }: { shift?: boolean } = {}) =>
  isApplePlatform() ? `⌘${shift ? "⇧" : ""}${key}` : `Ctrl+${shift ? "Shift+" : ""}${key}`;
