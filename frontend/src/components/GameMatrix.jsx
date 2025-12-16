import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLocation, useNavigate } from 'react-router-dom';
import FamilyTreeSelector from '../components/FamilyTreeSelector';
import GameMatrix from '../components/GameMatrix';
import { useGameState, useGameActions, useChartData } from '../hooks';
import { getSetting } from '../utils/settings';

function GamePlay() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Custom hooks for game state and actions
  const {
    players,
    activeGame,
    rounds,
    gameStats,
    loading,
    loadGameData,
    clearGame,
  } = useGameState(location);

  const {
    createGame: createGameAction,
    updateRound,
    finishGame,
    cancelGame,
    adjustRounds,
    editMetadata,
  } = useGameActions(activeGame, loadGameData, clearGame, navigate);

  // Chart data
  const chartData = useChartData(gameStats, rounds, activeGame);
  
  // New game form state
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [totalRounds, setTotalRounds] = useState(getSetting('game.default_rounds', 10));
  const [gameNotes, setGameNotes] = useState('');
  const [gameLocation, setGameLocation] = useState('');

  // Create game handler
  const handleCreateGame = async () => {
    if (selectedPlayers.length < 2) {
      alert('Select at least 2 players');
      return;
    }

    try {
      await createGameAction({
        player_ids: selectedPlayers,
        total_rounds: parseInt(totalRounds),
        notes: gameNotes || null,
        location: gameLocation || null,
      });
      
      // Reset form
      setSelectedPlayers([]);
      setGameNotes('');
      setGameLocation('');
    } catch (error) {
      alert('Error creating game');
    }
  };

  // Chart colors
  const colors = ['#00ff00', '#ffff00', '#00ffff', '#ff00ff', '#ff8800'];

  if (loading) {
    return <div className="page"><h1>Loading...</h1></div>;
  }

  return (
    <div className="page">
      {!activeGame ? (
        <div className="game-setup">
          <h2>New Game Setup</h2>
          
          <div className="form-group">
            <label>Total Rounds:</label>
            <input
              type="number"
              min="1"
              max="50"
              value={totalRounds}
              onChange={(e) => setTotalRounds(parseInt(e.target.value))}
            />
          </div>

          <div className="form-group">
            <label>Game Notes (optional):</label>
            <input
              type="text"
              placeholder="e.g., Tournament 2025"
              value={gameNotes}
              onChange={(e) => setGameNotes(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Game Location (optional):</label>
            <input
              type="text"
              placeholder="e.g., Home, Office, Online"
              value={gameLocation}
              onChange={(e) => setGameLocation(e.target.value)}
            />
          </div>

          <FamilyTreeSelector
            players={players}
            selectedPlayerIds={selectedPlayers}
            onSelectionChange={setSelectedPlayers}
          />

          <button onClick={handleCreateGame} disabled={selectedPlayers.length < 2}>
            Start Game ({selectedPlayers.length} players selected)
          </button>
        </div>
      ) : (
        <div className="active-game">
          <div className="game-header">
            <h2>
              Game #{activeGame.id} - Round {activeGame.current_round}/{activeGame.total_rounds}
            </h2>
            <div className="game-controls">
              <button onClick={adjustRounds} className="button">
                ⚙️ Adjust Rounds
              </button>
              <button onClick={editMetadata} className="button">
                📝 Edit Metadata
              </button>
              <button onClick={cancelGame} className="button danger">
                ❌ Cancel Game
              </button>
              <button onClick={finishGame} className="button success">
                🏁 Finish Game
              </button>
            </div>
          </div>

          <GameMatrix
            game={activeGame}
            players={gameStats}
            rounds={rounds}
            onRoundsUpdate={updateRound}
            onReload={() => loadGameData(activeGame.id)}
          />

          {chartData.length > 0 && (
            <div className="chart-container">
              <h3>📊 Score Progress</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00ff00" opacity={0.2} />
                  <XAxis 
                    dataKey="round" 
                    stroke="#00ff00"
                    label={{ value: 'Round', position: 'insideBottom', offset: -5, fill: '#00ff00' }}
                  />
                  <YAxis 
                    stroke="#00ff00"
                    label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: '#00ff00' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0a0e27', 
                      border: '2px solid #00ff00',
                      color: '#00ff00'
                    }}
                  />
                  {gameStats.map((stat, idx) => (
                    <Line
                      key={stat.player_id}
                      type="monotone"
                      dataKey={stat.player_alias}
                      stroke={colors[idx % colors.length]}
                      strokeWidth={2}
                      dot={{ fill: colors[idx % colors.length], r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

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
                {[...gameStats]
                  .sort((a, b) => b.total_score - a.total_score)
                  .map((stat, idx) => (
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
        </div>
      )}
    </div>
  );
}

export default GamePlay;
