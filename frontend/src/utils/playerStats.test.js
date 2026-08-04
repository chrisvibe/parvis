import { combinePlayerStats, combineBetDistributions } from './playerStats';

const entry = (id, alias, stats) => ({ id, alias, stats });

const stats = (overrides) => ({
  games_played: 0,
  total_rounds: 0,
  total_score: 0,
  successful_bets: 0,
  failed_bets: 0,
  average_bet: 0,
  win_rate: 0,
  ...overrides,
});

describe('combinePlayerStats', () => {
  test('one player is reported as themselves', () => {
    const combined = combinePlayerStats([
      entry(1, 'ana', stats({ games_played: 2, total_rounds: 10, total_score: 90 })),
    ]);

    expect(combined.player_id).toBe(1);
    expect(combined.player_alias).toBe('ana');
    expect(combined.total_score).toBe(90);
  });

  test('several players are reported as a group, not as one of them', () => {
    const combined = combinePlayerStats([
      entry(1, 'ana', stats({ total_rounds: 5 })),
      entry(2, 'ben', stats({ total_rounds: 5 })),
    ]);

    expect(combined.player_id).toBeNull();
    expect(combined.player_alias).toBe('2 players combined');
  });

  test('totals add up', () => {
    const combined = combinePlayerStats([
      entry(1, 'ana', stats({
        games_played: 2, total_rounds: 10, total_score: 90,
        successful_bets: 6, failed_bets: 4,
      })),
      entry(2, 'ben', stats({
        games_played: 3, total_rounds: 20, total_score: 100,
        successful_bets: 9, failed_bets: 11,
      })),
    ]);

    expect(combined.games_played).toBe(5);
    expect(combined.total_rounds).toBe(30);
    expect(combined.total_score).toBe(190);
    expect(combined.successful_bets).toBe(15);
    expect(combined.win_rate).toBeCloseTo(50);
  });

  test('the average bet is weighted by rounds, not an average of averages', () => {
    // A three-round player must not pull the figure as hard as a thirty-round
    // one. The naive mean here would be 5.5; the right answer is 1.5.
    const combined = combinePlayerStats([
      entry(1, 'ana', stats({ total_rounds: 1, average_bet: 10 })),
      entry(2, 'ben', stats({ total_rounds: 9, average_bet: 0.555555 })),
    ]);

    expect(combined.average_bet).toBeCloseTo(1.5, 3);
  });

  test('players who have never played read as zero, not NaN', () => {
    const combined = combinePlayerStats([entry(1, 'ana', stats({}))]);

    expect(combined.average_bet).toBe(0);
    expect(combined.win_rate).toBe(0);
  });

  test('selecting nobody gives null so the panel can say so', () => {
    expect(combinePlayerStats([])).toBeNull();
    expect(combinePlayerStats(null)).toBeNull();
  });
});

describe('combineBetDistributions', () => {
  test('counts for the same bet are summed', () => {
    const merged = combineBetDistributions([
      [{ bet: 0, count: 3 }, { bet: 2, count: 1 }],
      [{ bet: 0, count: 2 }, { bet: 1, count: 5 }],
    ]);

    expect(merged).toEqual([
      { bet: 0, count: 5 },
      { bet: 1, count: 5 },
      { bet: 2, count: 1 },
    ]);
  });

  test('the result is ordered by bet, whatever order it arrived in', () => {
    const merged = combineBetDistributions([[{ bet: 9, count: 1 }, { bet: 3, count: 1 }]]);

    expect(merged.map((d) => d.bet)).toEqual([3, 9]);
  });

  test('nothing to merge is an empty histogram', () => {
    expect(combineBetDistributions([])).toEqual([]);
    expect(combineBetDistributions(null)).toEqual([]);
    expect(combineBetDistributions([null, undefined])).toEqual([]);
  });
});
