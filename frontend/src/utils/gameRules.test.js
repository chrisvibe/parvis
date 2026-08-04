import { defaultSuccess } from './gameRules';
import { __setSettingsForTests } from './settings';

describe('defaultSuccess', () => {
  test('a round starts as made', () => {
    __setSettingsForTests({ game: { default_success: true } });
    expect(defaultSuccess()).toBe(true);
  });

  test('the old behaviour is still reachable from settings.yaml', () => {
    __setSettingsForTests({ game: { default_success: false } });
    expect(defaultSuccess()).toBe(false);
  });

  test('a false setting is honoured rather than treated as missing', () => {
    // getSetting falls back on `undefined` only. Had it tested truthiness,
    // `false` would have read as "unset" and quietly become true — which is
    // exactly the value someone turning this off would be writing.
    __setSettingsForTests({ game: { default_success: false } });
    expect(defaultSuccess()).not.toBe(true);
  });

  test('an unconfigured file assumes success', () => {
    __setSettingsForTests({});
    expect(defaultSuccess()).toBe(true);
  });
});
