import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { playersApi, gamesApi } from '../api';

function Stats() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [betDistribution, setBetDistribution] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Historical game viewer
  const [allGames, setAllGames] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [gameDetails, setGameDetails] = useState(null);
  const [gameStats, setGameStats] = useState([]);
  const [gameRounds, setGameRounds] = useState([]);
  const [gameChartData, setGameChartData] = useState([]);

  useEffect(() => {
    loadPlayers();
    loadAllGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAllGames = async () => {
    try {
      const res = await gamesApi.getAll(false); // Get all games, not just active
      // Filter to only valid (completed) games and sort by date descending
      const validGames = res.data
        .filter(g => g.is_valid)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setAllGames(validGames);
    } catch (error) {
      console.error('Error loading games:', error);
    }
  };

  const loadPlayers = async () => {
    try {
      const res = await playersApi.getAll();
      setPlayers(res.data);
      if (res.data.length > 0) {
        selectPlayer(res.data[0].id);
      }
    } catch (error) {
      console.error('Error loading players:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectPlayer = async (playerId) => {
    try {
      setSelectedPlayer(playerId);
      const [statsRes, distRes] = await Promise.all([
        playersApi.getStats(playerId),
        playersApi.getBetDistribution(playerId)
      ]);
      setPlayerStats(statsRes.data);
      setBetDistribution(distRes.data);
    } catch (error) {
      console.error('Error loading player stats:', error);
    }
  };

  const selectGame = async (gameId) => {
    if (!gameId) {
      setGameDetails(null);
      setGameStats([]);
      setGameRounds([]);
      setGameChartData([]);
      return;
    }

    try {
      const [gameRes, statsRes, roundsRes] = await Promise.all([
        gamesApi.get(gameId),
        gamesApi.getStats(gameId),
        gamesApi.getRounds(gameId)
      ]);
      
      setGameDetails(gameRes.data);
      setGameStats(statsRes.data);
      setGameRounds(roundsRes.data);
      
      // Build chart data
      const chartData = [];
      for (let i = 1; i <= gameRes.data.total_rounds; i++) {
        const point = { round: i };
        statsRes.data.forEach(stat => {
          const playerRounds = roundsRes.data
            .filter(r => r.player_id === stat.player_id && r.round_number <= i)
            .reduce((sum, r) => sum + (r.score || 0), 0);
          point[stat.player_alias] = playerRounds;
        });
        chartData.push(point);
      }
      setGameChartData(chartData);
    } catch (error) {
      console.error('Error loading game data:', error);
    }
  };

  if (loading) return <div className="loading">LOADING...</div>;

  if (players.length === 0) {
    return (
      <div className="card">
        <h2>NO STATISTICS AVAILABLE</h2>
        <p>No players registered yet. Go to PLAYERS page to add players.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>PLAYER STATISTICS</h2>
        
        <label>SELECT PLAYER</label>
        <select 
          value={selectedPlayer || ''} 
          onChange={(e) => selectPlayer(parseInt(e.target.value))}
        >
          {players.map(player => (
            <option key={player.id} value={player.id}>
              {player.alias}
            </option>
          ))}
        </select>

        {playerStats && (
          <>
            <div className="stat-grid" style={{ marginTop: '30px' }}>
              <div className="stat-box">
                <div className="label">GAMES PLAYED</div>
                <div className="value">{playerStats.games_played}</div>
              </div>
              
              <div className="stat-box">
                <div className="label">TOTAL ROUNDS</div>
                <div className="value">{playerStats.total_rounds}</div>
              </div>
              
              <div className="stat-box">
                <div className="label">TOTAL SCORE</div>
                <div className="value">{playerStats.total_score}</div>
              </div>
              
              <div className="stat-box">
                <div className="label">WIN RATE</div>
                <div className="value">{playerStats.win_rate.toFixed(1)}%</div>
              </div>
              
              <div className="stat-box">
                <div className="label">AVG BET</div>
                <div className="value">{playerStats.average_bet.toFixed(1)}</div>
              </div>
              
              <div className="stat-box">
                <div className="label">SUCCESSFUL</div>
                <div className="value" style={{ color: '#00ff00' }}>{playerStats.successful_bets}</div>
              </div>
              
              <div className="stat-box">
                <div className="label">FAILED</div>
                <div className="value" style={{ color: '#ff0000' }}>{playerStats.failed_bets}</div>
              </div>
            </div>

            {/* Bet Distribution Histogram */}
            {betDistribution.length > 0 && (
              <div style={{ marginTop: '40px' }}>
                <h3 style={{ color: '#00ff00', marginBottom: '20px' }}>BET DISTRIBUTION</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={betDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#00ff00" opacity={0.2} />
                    <XAxis 
                      dataKey="bet" 
                      stroke="#00ff00"
                      label={{ value: 'Bet Amount', position: 'insideBottom', offset: -5, fill: '#00ff00' }}
                    />
                    <YAxis 
                      stroke="#00ff00"
                      label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fill: '#00ff00' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: '#0a0e27', 
                        border: '2px solid #00ff00',
                        fontFamily: 'Courier New',
                        color: '#00ff00'
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="#00ff00"
                      name="Times Bet"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Performance Breakdown */}
            <div style={{ marginTop: '40px' }}>
              <h3 style={{ color: '#00ff00', marginBottom: '15px' }}>PERFORMANCE BREAKDOWN</h3>
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
                    <td>{playerStats.total_rounds}</td>
                  </tr>
                  <tr>
                    <td>Successful Bets</td>
                    <td style={{ color: '#00ff00' }}>{playerStats.successful_bets}</td>
                  </tr>
                  <tr>
                    <td>Failed Bets</td>
                    <td style={{ color: '#ff0000' }}>{playerStats.failed_bets}</td>
                  </tr>
                  <tr>
                    <td>Win Rate</td>
                    <td>{playerStats.win_rate.toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td>Average Bet</td>
                    <td>{playerStats.average_bet.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td>Total Score</td>
                    <td style={{ fontSize: '1.2rem', color: '#00ff00' }}>{playerStats.total_score}</td>
                  </tr>
                  <tr>
                    <td>Average Score Per Round</td>
                    <td>
                      {playerStats.total_rounds > 0 
                        ? (playerStats.total_score / playerStats.total_rounds).toFixed(2)
                        : '0.00'
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Historical Game Viewer */}
      <div className="card" style={{ marginTop: '30px' }}>
        <h2>📜 HISTORICAL GAME VIEWER</h2>
        
        <div className="form-group">
          <label>Select Game:</label>
          <input
            list="games-list"
            type="text"
            placeholder="Search by game ID or notes..."
            value={selectedGameId}
            onChange={(e) => {
              setSelectedGameId(e.target.value);
              const gameId = parseInt(e.target.value);
              if (!isNaN(gameId)) {
                selectGame(gameId);
              }
            }}
          />
          <datalist id="games-list">
            {allGames.map(game => (
              <option 
                key={game.id} 
                value={game.id}
              >
                Game #{game.id} - {new Date(game.date).toLocaleDateString()} {game.notes ? `- ${game.notes}` : ''}
              </option>
            ))}
          </datalist>
        </div>

        {gameDetails && (
          <>
            <div style={{ marginTop: '20px', padding: '20px', background: '#16213e', borderRadius: '8px' }}>
              <h3 style={{ color: '#00ff00', marginBottom: '15px' }}>
                GAME #{gameDetails.id} DETAILS
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <strong>Date:</strong> {new Date(gameDetails.date).toLocaleString()}
                </div>
                <div>
                  <strong>Rounds:</strong> {gameDetails.total_rounds}
                </div>
                <div>
                  <strong>Type:</strong> {gameDetails.game_type}
                </div>
                <div>
                  <strong>Location:</strong> {gameDetails.location || 'N/A'}
                </div>
                {gameDetails.notes && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong>Notes:</strong> {gameDetails.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Player Standings for this game */}
            <div style={{ marginTop: '30px' }}>
              <h3 style={{ color: '#00ff00', marginBottom: '15px' }}>🏆 FINAL STANDINGS</h3>
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
                  {[...gameStats]
                    .sort((a, b) => b.total_score - a.total_score)
                    .map((stat, idx) => (
                      <tr key={stat.player_id}>
                        <td>{idx + 1}</td>
                        <td>{stat.player_alias}</td>
                        <td style={{ color: '#00ff00', fontWeight: 'bold' }}>{stat.total_score}</td>
                        <td>{stat.rounds_played}</td>
                        <td>
                          {stat.rounds_played > 0 
                            ? ((stat.successful_bets / stat.rounds_played) * 100).toFixed(1) 
                            : 0}%
                        </td>
                        <td>{stat.average_bet.toFixed(1)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Score Progress Chart */}
            {gameChartData.length > 0 && (
              <div style={{ marginTop: '30px' }}>
                <h3 style={{ color: '#00ff00', marginBottom: '15px' }}>📊 SCORE PROGRESS</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={gameChartData}>
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
                        fontFamily: 'Courier New',
                        color: '#00ff00'
                      }}
                    />
                    <Legend />
                    {gameStats.map((stat, idx) => (
                      <Line 
                        key={stat.player_id}
                        type="monotone" 
                        dataKey={stat.player_alias} 
                        stroke={`hsl(${(idx * 360) / gameStats.length}, 70%, 60%)`}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {!gameDetails && allGames.length > 0 && (
          <p style={{ marginTop: '20px', color: '#666', textAlign: 'center' }}>
            Select a game from the dropdown to view its statistics
          </p>
        )}

        {allGames.length === 0 && (
          <p style={{ marginTop: '20px', color: '#666', textAlign: 'center' }}>
            No completed games available yet
          </p>
        )}
      </div>
    </div>
  );
}

export default Stats;
