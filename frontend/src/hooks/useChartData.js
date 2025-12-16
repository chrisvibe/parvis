import { useMemo } from 'react';

/**
 * Custom hook for calculating chart data from game stats and rounds.
 * 
 * Builds cumulative score data for each round to display on line chart.
 * 
 * @param {Array} gameStats - Array of player statistics
 * @param {Array} rounds - Array of round data
 * @param {Object} activeGame - Current active game
 * @returns {Array} Chart data formatted for Recharts LineChart
 */
export function useChartData(gameStats, rounds, activeGame) {
  return useMemo(() => {
    if (!gameStats?.length || !rounds?.length || !activeGame) {
      return [];
    }

    const data = [];

    // Build cumulative scores for each round
    for (let i = 1; i <= activeGame.total_rounds; i++) {
      const point = { round: i };
      
      gameStats.forEach(stat => {
        // Sum all scores up to this round for this player
        const cumulativeScore = rounds
          .filter(r => r.player_id === stat.player_id && r.round_number <= i)
          .reduce((sum, r) => sum + (r.score || 0), 0);
        
        point[stat.player_alias] = cumulativeScore;
      });
      
      data.push(point);
    }

    return data;
  }, [rounds, gameStats, activeGame]);
}
