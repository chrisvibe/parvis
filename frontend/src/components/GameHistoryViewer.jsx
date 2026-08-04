import React from 'react';
import ScoreChart from './ScoreChart';
import { formatDateTime } from '../utils/datetime';

/**
 * Browse finished games: search, pick one, read it back.
 *
 * @param {Object} history - everything useGameHistory returns
 * @param {Function} onEditGame - reopen a finished game for editing
 */
function GameHistoryViewer({ history, onEditGame }) {
  const {
    allGames, displayGames, searchTerm, setSearchTerm, isSearching,
    selectedGameId, selectGame, game, gameStats, chartData,
  } = history;

  const standings = [...gameStats].sort((a, b) => b.total_score - a.total_score);

  return (
    <div className="card section">
      <h2>📜 HISTORICAL GAME VIEWER</h2>

      <div className="form-group">
        <label>Search Games:</label>
        <input
          type="text"
          placeholder="Filter by ID, date, status (finished/unfinished), notes, location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {allGames.length === 0 ? (
        <p className="empty-note">No completed games available yet</p>
      ) : (
        <>
          <div className="form-group">
            <label>
              {isSearching
                ? `Select Game (${displayGames.length} matching):`
                : `Select Game (showing ${displayGames.length} most recent):`}
            </label>
            <select
              value={selectedGameId || ''}
              onChange={(e) => selectGame(parseInt(e.target.value, 10) || null)}
              size={Math.min(displayGames.length + 1, 6)}
            >
              <option value="">-- Select a game --</option>
              {displayGames.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  Game #{candidate.id} - {formatDateTime(candidate.date)}
                  {candidate.notes ? ` - ${candidate.notes}` : ''}
                </option>
              ))}
            </select>
          </div>

          {game && (
            <>
              <div className="detail-panel">
                <h3>GAME #{game.id} DETAILS</h3>

                <div className="detail-grid">
                  <div><strong>Date:</strong> {formatDateTime(game.date)}</div>
                  <div><strong>Rounds:</strong> {game.total_rounds}</div>
                  <div><strong>Type:</strong> {game.game_type}</div>
                  <div>
                    <strong>Status:</strong>{' '}
                    <span className={game.is_valid ? 'text-good' : 'text-warn'}>
                      {game.is_valid ? 'FINISHED' : 'UNFINISHED'}
                    </span>
                  </div>
                  <div><strong>Location:</strong> {game.location || 'N/A'}</div>
                  {game.notes && (
                    <div className="full-width"><strong>Notes:</strong> {game.notes}</div>
                  )}
                </div>

                <div className="panel-footer">
                  <button onClick={() => onEditGame(game.id)}>✏️ EDIT GAME</button>
                </div>
              </div>

              <div className="section">
                <h3>🏆 FINAL STANDINGS</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Player</th>
                      <th>Total Score</th>
                      <th>Rounds</th>
                      <th>Success Rate</th>
                      <th>Avg Bet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((stat, index) => (
                      <tr key={stat.player_id}>
                        <td>{index + 1}</td>
                        <td>{stat.player_alias}</td>
                        <td className="text-key">{stat.total_score}</td>
                        <td>{stat.rounds_played}</td>
                        <td>{stat.win_rate.toFixed(1)}%</td>
                        <td>{stat.average_bet.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="section">
                <ScoreChart
                  chartData={chartData}
                  gameStats={gameStats}
                  title="📊 SCORE PROGRESS"
                  showLegend
                />
              </div>
            </>
          )}

          {displayGames.length === 0 && isSearching && (
            <p className="empty-note attention">No games match "{searchTerm}"</p>
          )}

          {!game && displayGames.length > 0 && (
            <p className="empty-note">Select a game from the list to view its statistics</p>
          )}
        </>
      )}
    </div>
  );
}

export default GameHistoryViewer;
