import React from 'react';

/**
 * Leaderboard - Displays current game standings.
 * 
 * Shows players ranked by total score with their stats.
 * 
 * @param {Array} gameStats - Array of player statistics
 */
function Leaderboard({ gameStats }) {
  if (!gameStats || gameStats.length === 0) {
    return null;
  }

  // Sort by total score descending
  const sortedStats = [...gameStats].sort((a, b) => b.total_score - a.total_score);

  return (
    <div className="leaderboard">
      <h3>🏆 Current Standings</h3>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Total Score</th>
            <th>Rounds Played</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>
          {sortedStats.map((stat, idx) => (
            <tr key={stat.player_id}>
              <td>{idx + 1}</td>
              <td>{stat.player_alias}</td>
              <td>{stat.total_score}</td>
              <td>{stat.rounds_played}</td>
              <td>
                {stat.rounds_played > 0
                  ? `${((stat.successful_bets / stat.rounds_played) * 100).toFixed(1)}%`
                  : 'N/A'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Leaderboard;
