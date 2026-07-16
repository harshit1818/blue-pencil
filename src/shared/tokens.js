// Design tokens — the single source of truth for Blue Pencil.
// Components import from here. Do not redefine colors/type inline.
// Light + dark sets; pick by macOS system appearance (Electron nativeTheme).

export const color = {
  light: {
    ink: "#16181d",        // text, dark UI
    paper: "#faf8f3",      // app background
    panel: "#ffffff",      // cards, popover, textarea
    line: "#e7e2d6",       // borders, dividers
    muted: "#6f6a5f",      // captions, secondary text
    pencil: "#1f5fa8",     // primary accent — the blue pencil
    onPencil: "#ffffff",   // text/icons on pencil fills (6.44:1)
    pencilSoft: "#eaf1fa", // active fills
    mark: "#c2453d",       // corrections only
    markSoft: "#fbecea",   // correction background
  },
  dark: {
    ink: "#f2efe8",
    paper: "#16171b",
    panel: "#1d1f25",
    line: "#33353d",
    muted: "#9b958a",
    pencil: "#6ba4e6",     // lifted for contrast on dark
    onPencil: "#16171b",   // dark ink on lifted pencil (6.89:1); white was 2.60:1
    pencilSoft: "#1e2b3d",
    mark: "#e07a72",
    markSoft: "#2e2120",
  },
};

// Mac-available system faces — no webfont bundling required.
export const font = {
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  grotesk: 'ui-sans-serif, system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
};

export const radius = { sm: 7, md: 10, lg: 12, pill: 999 };

export const shadow = {
  popover: "0 16px 40px -8px rgba(20,24,29,.30)",
  badge: "0 4px 12px rgba(31,95,168,.40)",
  window: "0 24px 60px -12px rgba(20,24,29,.34)",
};

// 4px base scale.
export const space = { xs: 4, sm: 8, md: 14, lg: 18, xl: 22, xxl: 30 };
