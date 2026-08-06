import { getSetting } from './settings';

/**
 * How a round starts out, before anybody marks results.
 *
 * Read through a function rather than copied into the two places that open a
 * round — game creation and NEXT ROUND — because the two disagreeing would be
 * the sort of bug nobody notices until the first round of a game scores
 * differently from every round after it.
 *
 * Assuming success is the shorter list to correct: most bets are made, so MARK
 * RESULTS becomes a matter of clicking the players who went down. The cost is
 * that an unmarked round already counts as won, so the running total mid-round
 * reads "what everyone gets if they all make it" rather than "nobody has
 * anything yet" — provisional either way, and settable back in settings.yaml.
 */
export const defaultSuccess = () => getSetting('game.default_success', true);

/**
 * Whether a part-typed bet is one the round could hold.
 *
 * Round N deals N cards, so N is the most anybody can bid in it. The check runs
 * on every keystroke rather than on commit, which is why it has to accept the
 * empty string: clearing the box on the way to typing a different number is not
 * an illegal bet, it is halfway through entering one.
 *
 * Shared by the two ways a digit reaches a cell — typing into an open editor,
 * and typing at a cell that is merely focused, which opens the editor on that
 * digit. The two disagreeing would mean a bet the keyboard could enter and the
 * mouse could not.
 */
export const betIsAllowed = (value, roundNumber) =>
  value === '' || (/^\d+$/.test(value) && parseInt(value, 10) <= roundNumber);
