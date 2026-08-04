import { buildCumulativeScoreData } from './chartData';

const stats = [
  { player_id: 1, player_alias: 'ana' },
  { player_id: 2, player_alias: 'ben' },
];

const round = (number, playerId, score) => ({
  round_number: number, player_id: playerId, score,
});

describe('buildCumulativeScoreData', () => {
  test('scores accumulate rather than being reported per round', () => {
    const data = buildCumulativeScoreData(stats, [
      round(1, 1, 11), round(1, 2, 0),
      round(2, 1, 12), round(2, 2, 13),
    ], 2);

    expect(data).toEqual([
      { round: 1, ana: 11, ben: 0 },
      { round: 2, ana: 23, ben: 13 },
    ]);
  });

  test('rounds in any order give the same line', () => {
    const shuffled = buildCumulativeScoreData(stats, [
      round(2, 2, 13), round(1, 1, 11), round(2, 1, 12), round(1, 2, 0),
    ], 2);

    expect(shuffled[1]).toEqual({ round: 2, ana: 23, ben: 13 });
  });

  test('unplayed rounds are still plotted, holding the last score', () => {
    // The chart is drawn for the whole game, so the axis does not grow as the
    // game is played.
    const data = buildCumulativeScoreData(stats, [round(1, 1, 11)], 3);

    expect(data).toHaveLength(3);
    expect(data[2]).toEqual({ round: 3, ana: 11, ben: 0 });
  });

  test('a round with no score yet counts as nothing, not NaN', () => {
    const data = buildCumulativeScoreData(stats, [
      round(1, 1, 11), { round_number: 1, player_id: 2, score: null },
    ], 1);

    expect(data[0].ben).toBe(0);
  });

  test('a round belonging to someone not in the game is ignored', () => {
    const data = buildCumulativeScoreData(stats, [
      round(1, 1, 11), round(1, 99, 500),
    ], 1);

    expect(data[0]).toEqual({ round: 1, ana: 11, ben: 0 });
  });

  test('nothing to plot gives an empty list rather than an empty chart frame', () => {
    expect(buildCumulativeScoreData([], [round(1, 1, 11)], 1)).toEqual([]);
    expect(buildCumulativeScoreData(stats, [], 1)).toEqual([]);
    expect(buildCumulativeScoreData(stats, [round(1, 1, 11)], 0)).toEqual([]);
    expect(buildCumulativeScoreData(null, null, null)).toEqual([]);
  });
});
