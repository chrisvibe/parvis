import {
  DEFAULT_THEME,
  SETTING_TO_VARIABLE,
  themeOverridesFromSettings,
  installTheme,
  color,
  chartLineColor,
} from './theme';

afterEach(() => {
  installTheme();  // back to the defaults for the next test
});

describe('themeOverridesFromSettings', () => {
  test('a settings key is routed to its variable', () => {
    const overrides = themeOverridesFromSettings({ colors: { text: '#abcdef' } });

    expect(overrides['--fg']).toBe('#abcdef');
  });

  test('a partial settings file only changes what it mentions', () => {
    const overrides = themeOverridesFromSettings({ colors: { text: '#abcdef' } });

    expect(overrides['--bg']).toBeUndefined();
  });

  test('blank and null values are left to the default', () => {
    // An empty value in settings.yaml means "not set", not "no colour".
    const overrides = themeOverridesFromSettings({
      colors: { text: '', background: null },
    });

    expect(overrides).toEqual({});
  });

  test('an absent or malformed settings file yields no overrides', () => {
    expect(themeOverridesFromSettings(undefined)).toEqual({});
    expect(themeOverridesFromSettings({})).toEqual({});
    expect(themeOverridesFromSettings({ colors: 'not an object' })).toEqual({});
  });

  test('every mapped setting points at a variable that exists', () => {
    // A typo here would silently do nothing, which is how the colors block sat
    // in settings.yaml for months without changing anything on screen.
    for (const variable of Object.values(SETTING_TO_VARIABLE)) {
      expect(DEFAULT_THEME).toHaveProperty(variable);
    }
  });
});

describe('installTheme', () => {
  test('the palette is readable from JavaScript', () => {
    installTheme({ '--fg': '#123456' });

    expect(color('--fg')).toBe('#123456');
  });

  test('an override does not drop the variables it did not mention', () => {
    installTheme({ '--fg': '#123456' });

    expect(color('--bg')).toBe(DEFAULT_THEME['--bg']);
  });

  test('installing again with nothing returns to the defaults', () => {
    installTheme({ '--fg': '#123456' });
    installTheme();

    expect(color('--fg')).toBe(DEFAULT_THEME['--fg']);
  });

  test('the variables land on the document so the stylesheets see them', () => {
    installTheme({ '--fg': '#123456' });

    expect(document.documentElement.style.getPropertyValue('--fg')).toBe('#123456');
  });
});

describe('chartLineColor', () => {
  test('series are spread around the hue circle', () => {
    expect(chartLineColor(0, 4)).toBe('hsl(0, 70%, 60%)');
    expect(chartLineColor(1, 4)).toBe('hsl(90, 70%, 60%)');
  });

  test('a single series does not divide by zero', () => {
    expect(chartLineColor(0, 0)).toBe('hsl(0, 70%, 60%)');
  });
});
