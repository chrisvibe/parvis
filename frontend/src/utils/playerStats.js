/**
 * Rolling several players' lifetime statistics into one set of figures.
 *
 * The statistics page lets you tick more than one player and shows the group as
 * a single row of boxes. Keeping the arithmetic here rather than inside the
 * page means it can be tested without rendering anything, and there is one
 * place that decides what "average bet across two players" means.
 */

/**
 * @param {Array} entries - [{ id, alias, stats }] as returned by /players/{id}/stats
 * @returns {Object|null} combined figures, or null when nothing is selected
 */
export function combinePlayerStats(entries) {
  if (!entries?.length) return null;

  const combined = {
    player_id: entries.length === 1 ? entries[0].id : null,
    player_alias: entries.length === 1
      ? entries[0].alias
      : `${entries.length} players combined`,
    games_played: 0,
    total_rounds: 0,
    total_score: 0,
    successful_bets: 0,
    failed_bets: 0,
    average_bet: 0,
    win_rate: 0,
  };

  // An average of averages would weight a three-round player the same as a
  // thirty-round one, so the bets are un-averaged back into a total first.
  let betTotal = 0;

  for (const { stats } of entries) {
    combined.games_played += stats.games_played;
    combined.total_rounds += stats.total_rounds;
    combined.total_score += stats.total_score;
    combined.successful_bets += stats.successful_bets;
    combined.failed_bets += stats.failed_bets;
    betTotal += stats.average_bet * stats.total_rounds;
  }

  if (combined.total_rounds > 0) {
    combined.average_bet = betTotal / combined.total_rounds;
    combined.win_rate = (combined.successful_bets / combined.total_rounds) * 100;
  }

  return combined;
}

/**
 * Merge several bet histograms into one, summing the counts for each bet value.
 *
 * @param {Array} distributions - one `[{ bet, count }]` list per player
 * @returns {Array} a single `[{ bet, count }]` list, ordered by bet
 */
export function combineBetDistributions(distributions) {
  const counts = new Map();

  for (const distribution of distributions || []) {
    for (const { bet, count } of distribution || []) {
      counts.set(bet, (counts.get(bet) || 0) + count);
    }
  }

  return [...counts.entries()]
    .map(([bet, count]) => ({ bet: Number(bet), count }))
    .sort((a, b) => a.bet - b.bet);
}
