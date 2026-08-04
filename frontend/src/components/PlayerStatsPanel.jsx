import React from 'react';
import MultiSelect from './MultiSelect';
import BetDistributionChart from './BetDistributionChart';

/**
 * Lifetime figures for one player, or for several added together.
 *
 * @param {Array} players - the roster to choose from
 * @param {Array} selectedPlayerIds - who is currently shown
 * @param {Function} onSelectionChange - called with the new id array
 * @param {Object} stats - combined statistics, or null
 * @param {Array} betDistribution - combined histogram
 */
function PlayerStatsPanel({ players, selectedPlayerIds, onSelectionChange, stats, betDistribution }) {
  const items = players.map((player) => {
    const realName = [player.first_name, player.last_name].filter(Boolean).join(' ');
    return {
      id: player.id,
      label: player.alias,
      hint: realName || null,
      searchText: [player.alias, realName].filter(Boolean).join(' '),
    };
  });

  const averageScore = stats && stats.total_rounds > 0
    ? (stats.total_score / stats.total_rounds).toFixed(2)
    : '0.00';

  return (
    <div className="card">
      <h2>PLAYER STATISTICS</h2>

      <MultiSelect
        label="Select Players"
        items={items}
        selectedIds={selectedPlayerIds}
        onChange={onSelectionChange}
        searchPlaceholder="Filter players by name..."
        addPlaceholder="-- Select a player to add --"
        selectionTitle="Selected Players"
        emptyText="No players selected"
        showMatchCount
        visibleOptions={6}
      />

      {stats && (
        <>
          <div className="stat-grid">
            <div className="stat-box">
              <div className="label">GAMES PLAYED</div>
              <div className="value">{stats.games_played}</div>
            </div>

            <div className="stat-box">
              <div className="label">TOTAL ROUNDS</div>
              <div className="value">{stats.total_rounds}</div>
            </div>

            <div className="stat-box">
              <div className="label">TOTAL SCORE</div>
              <div className="value">{stats.total_score}</div>
            </div>

            <div className="stat-box">
              <div className="label">WIN RATE</div>
              <div className="value">{stats.win_rate.toFixed(1)}%</div>
            </div>

            <div className="stat-box">
              <div className="label">AVG BET</div>
              <div className="value">{stats.average_bet.toFixed(1)}</div>
            </div>

            <div className="stat-box">
              <div className="label">SUCCESSFUL</div>
              <div className="value text-good">{stats.successful_bets}</div>
            </div>

            <div className="stat-box">
              <div className="label">FAILED</div>
              <div className="value text-bad">{stats.failed_bets}</div>
            </div>
          </div>

          <BetDistributionChart distribution={betDistribution} />

          <div className="section wide">
            <h3>PERFORMANCE BREAKDOWN</h3>
            <table>
              <thead>
                <tr>
                  <th>METRIC</th>
                  <th>VALUE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total Rounds Played</td>
                  <td>{stats.total_rounds}</td>
                </tr>
                <tr>
                  <td>Successful Bets</td>
                  <td className="text-good">{stats.successful_bets}</td>
                </tr>
                <tr>
                  <td>Failed Bets</td>
                  <td className="text-bad">{stats.failed_bets}</td>
                </tr>
                <tr>
                  <td>Win Rate</td>
                  <td>{stats.win_rate.toFixed(2)}%</td>
                </tr>
                <tr>
                  <td>Average Bet</td>
                  <td>{stats.average_bet.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Total Score</td>
                  <td className="text-headline">{stats.total_score}</td>
                </tr>
                <tr>
                  <td>Average Score Per Round</td>
                  <td>{averageScore}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default PlayerStatsPanel;
