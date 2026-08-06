import { defaultSuccess, betIsAllowed } from './gameRules';
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

describe('betIsAllowed', () => {
  test('you can bid every card in the round', () => {
    expect(betIsAllowed('3', 3)).toBe(true);
  });

  test('you cannot bid a card that was not dealt', () => {
    expect(betIsAllowed('4', 3)).toBe(false);
  });

  test('nothing at all is allowed on the way to something else', () => {
    // Backspacing the box empty is halfway through typing a bet, not an
    // illegal one. Rejecting it would make the field impossible to correct.
    expect(betIsAllowed('', 3)).toBe(true);
  });

  test('passing is a bid', () => {
    expect(betIsAllowed('0', 3)).toBe(true);
  });

  test('only digits', () => {
    // A bet goes to the server through parseInt, which reads "2x" as 2 and
    // "-1" as -1. Both would be stored as a bet nobody made.
    expect(betIsAllowed('2x', 5)).toBe(false);
    expect(betIsAllowed('-1', 5)).toBe(false);
    expect(betIsAllowed(' ', 5)).toBe(false);
  });

  test('a leading zero is still the number it looks like', () => {
    expect(betIsAllowed('03', 3)).toBe(true);
    expect(betIsAllowed('03', 2)).toBe(false);
  });
});
