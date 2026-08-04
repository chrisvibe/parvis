import yaml from 'js-yaml';

/**
 * Runtime settings, read once from public/settings.yaml.
 *
 * `settings.yaml` is the source of truth: there is deliberately no parallel
 * table of defaults in here. There used to be one, and it duplicated every key
 * in the yaml file with nothing keeping the two in step. What remains is the
 * fallback argument each call site already passes to `getSetting`, which is a
 * local guard rather than a second copy of the configuration.
 *
 * Ordering matters and is handled in index.js: `loadSettings()` is awaited
 * before the first render, so `getSetting` is never called against an unloaded
 * file. Before that fix nothing called `loadSettings` at all, so every lookup
 * quietly returned its fallback and the whole yaml file — colours included —
 * had never once been read.
 */
let settings = null;

export const loadSettings = async () => {
  if (settings) return settings;

  try {
    const response = await fetch('/settings.yaml');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    settings = yaml.load(await response.text()) || {};
  } catch (error) {
    // Not fatal: every call site carries its own fallback, so the app still
    // runs, it just runs unconfigured.
    console.error('Failed to load settings.yaml, falling back to built-in values:', error);
    settings = {};
  }

  return settings;
};

/** Walk a dotted path into a plain object, returning undefined if it runs out. */
export const readPath = (source, path) => {
  let value = source;

  for (const key of path.split('.')) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }

  return value;
};

export const getSetting = (path, fallback = null) => {
  const value = readPath(settings, path);
  return value === undefined ? fallback : value;
};

/** Test seam: install a settings object without going through fetch. */
export const __setSettingsForTests = (value) => {
  settings = value;
};
