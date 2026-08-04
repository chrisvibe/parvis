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
