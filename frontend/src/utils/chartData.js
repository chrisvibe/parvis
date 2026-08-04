/**
 * Cumulative score per round, in the shape recharts wants:
 * `[{ round: 1, alice: 11, bob: 0 }, ...]`.
 *
 * One copy, used by both the live game chart (through useChartData) and the
 * historical game viewer. They used to carry the same nested loop written out
 * twice, so a change to how a score accumulates only landed on one of the two
 * charts.
 *
 * @param {Array} gameStats - one entry per player, giving player_id and player_alias
 * @param {Array} rounds - every round row of the game, in any order
 * @param {Number} totalRounds - how many rounds the game has, including unplayed ones
 * @returns {Array} one point per round, or [] if there is nothing to plot
 */
export function buildCumulativeScoreData(gameStats, rounds, totalRounds) {
  if (!gameStats?.length || !rounds?.length || !totalRounds) {
    return [];
  }

  const roundsByNumber = new Map();
  for (const round of rounds) {
    const bucket = roundsByNumber.get(round.round_number);
    if (bucket) {
      bucket.push(round);
    } else {
      roundsByNumber.set(round.round_number, [round]);
    }
  }

  // Carried forward rather than re-summed per round, so a long game does not
  // re-walk every earlier round for every player.
  const runningScore = new Map(gameStats.map((stat) => [stat.player_id, 0]));

  const data = [];
  for (let number = 1; number <= totalRounds; number++) {
    for (const round of roundsByNumber.get(number) || []) {
      if (runningScore.has(round.player_id)) {
        runningScore.set(round.player_id, runningScore.get(round.player_id) + (round.score || 0));
      }
    }

    const point = { round: number };
    for (const stat of gameStats) {
      point[stat.player_alias] = runningScore.get(stat.player_id);
    }
    data.push(point);
  }

  return data;
}
