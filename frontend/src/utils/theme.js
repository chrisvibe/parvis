import { readPath } from './settings';

/**
 * The palette, in one place.
 *
 * This table is the single source of truth for colour. The stylesheets never
 * name a colour directly — they say `var(--fg)` — and JavaScript that has to
 * hand a real colour string to a library (recharts, SVG attributes) calls
 * `color('--fg')`. Adding a hex literal anywhere else puts the app back where it
 * started, with the same green written out in forty places and a design system
 * in index.css that nothing obeyed.
 *
 * The values live here rather than in `:root` in index.css because JavaScript
 * cannot reliably read a custom property back out of a stylesheet, and recharts
 * will not accept `var(...)` in the props it turns into SVG attributes. Going
 * the other way — JS owns them, CSS reads them — works in both directions, so
 * that is the direction chosen. `installTheme()` writes the table onto the
 * document root before the first render, which is where the stylesheets pick
 * it up.
 */
export const DEFAULT_THEME = {
  // Surfaces
  '--bg': '#0a0e27',
  '--panel': '#16213e',
  '--panel-alt': '#1a1a2e',

  // Ink
  '--fg': '#00ff00',
  '--fg-inverse': '#0a0e27',
  '--muted': '#666666',
  // A rule that separates without shouting — the full --fg green is too loud
  // for a list of ten rows.
  '--border': '#2a3a5a',

  // Signals
  '--danger': '#ff0000',
  '--warn': '#ffff00',
  '--accent': '#00ffff',
  '--attention': '#ff6600',

  // Family tree
  '--node-default': '#00ff00',
  '--node-selected': '#ffff00',
  '--node-hover': '#00ffff',
  '--edge-color': '#00ff00',

  // Game matrix
  '--cell-empty': '#1a1a2e',
  '--cell-bet-pending': '#444444',
  '--cell-success': '#00ff00',
  '--cell-failed': '#ff0000',
  '--cell-priority': '#00ffff',
  '--cell-future-bg': '#0a0a0a',
  '--cell-future-fg': '#333333',
  '--cell-border-width': '1px',
  '--cell-priority-border-width': '3px',
};

/**
 * Which settings.yaml keys may override which variable.
 *
 * The `colors` and `matrix` blocks have been sitting in settings.yaml since the
 * beginning without changing anything on screen, partly because nothing ever
 * called loadSettings() and partly because only the family tree looked at them.
 * Routing them through the theme means one entry here makes a setting apply
 * everywhere the variable is used.
 */
export const SETTING_TO_VARIABLE = {
  'colors.background': '--bg',
  'colors.text': '--fg',
  'colors.border': '--border',
  'colors.muted': '--muted',
  'colors.attention': '--attention',
  'colors.node_default': '--node-default',
  'colors.node_selected': '--node-selected',
  'colors.node_hover': '--node-hover',
  'colors.edge_color': '--edge-color',
  'matrix.cell_empty': '--cell-empty',
  'matrix.cell_bet_pending': '--cell-bet-pending',
  'matrix.cell_success': '--cell-success',
  'matrix.cell_failed': '--cell-failed',
  'matrix.cell_priority': '--cell-priority',
  'matrix.cell_border': '--cell-border-width',
  'matrix.cell_priority_border': '--cell-priority-border-width',
};

let currentTheme = { ...DEFAULT_THEME };

/**
 * Pull the theme overrides out of a loaded settings object.
 *
 * Anything missing, blank or null is left alone, so a partial settings.yaml
 * only changes what it actually mentions.
 */
export function themeOverridesFromSettings(settings) {
  const overrides = {};

  for (const [path, variable] of Object.entries(SETTING_TO_VARIABLE)) {
    const value = readPath(settings, path);
    if (value !== undefined && value !== null && value !== '') {
      overrides[variable] = String(value);
    }
  }

  return overrides;
}

/**
 * Apply the palette to the document and make it readable from JavaScript.
 *
 * Called once with no arguments before anything renders, so the first paint is
 * already correct, and again with the settings overrides once they have loaded.
 */
export function installTheme(overrides = {}) {
  currentTheme = { ...DEFAULT_THEME, ...overrides };

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    for (const [variable, value] of Object.entries(currentTheme)) {
      root.style.setProperty(variable, value);
    }
  }

  return currentTheme;
}

/** The current value of a theme variable, e.g. color('--fg'). */
export function color(variable) {
  return currentTheme[variable];
}

/**
 * A line colour for series `index` of `total`, spread evenly around the hue
 * circle. Shared so the two score charts cannot drift into different palettes.
 */
export function chartLineColor(index, total) {
  const count = Math.max(total, 1);
  return `hsl(${Math.round((index * 360) / count)}, 70%, 60%)`;
}

/**
 * Recharts takes styling as props rather than CSS, so the chart chrome is
 * described here instead of in a stylesheet — still off the one palette.
 */
export function chartTooltipStyle() {
  return {
    backgroundColor: color('--bg'),
    border: `2px solid ${color('--fg')}`,
    fontFamily: 'Courier New',
    color: color('--fg'),
  };
}

export function chartAxisLabel(value, extra = {}) {
  return { value, fill: color('--fg'), ...extra };
}
