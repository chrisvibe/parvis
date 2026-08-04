import { useMemo } from 'react';
import { buildCumulativeScoreData } from '../utils/chartData';

/**
 * Memoised cumulative score data for the active game.
 *
 * The arithmetic lives in utils/chartData so the historical game viewer, which
 * is not a component and cannot use a hook, can reach the same code.
 *
 * @param {Array} gameStats - Array of player statistics
 * @param {Array} rounds - Array of round data
 * @param {Object} activeGame - Current active game
 * @returns {Array} Chart data formatted for Recharts LineChart
 */
export function useChartData(gameStats, rounds, activeGame) {
  return useMemo(
    () => buildCumulativeScoreData(gameStats, rounds, activeGame?.total_rounds),
    [rounds, gameStats, activeGame]
  );
}
