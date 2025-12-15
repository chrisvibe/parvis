import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { playersApi, gamesApi } from '../api';
import { getSetting } from '../utils/settings';
import { useNavigate, useLocation } from 'react-router-dom';

function Stats() {
  const navigate = useNavigate();
  const location = useLocation();
  const [players, setPlayers] = useState([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]); // Changed to array for multi-select
  const [playerStats, setPlayerStats] = useState(null);
  const [betDistribution, setBetDistribution] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Player search
  const [playerSearchTerm, setPlayerSearchTerm] = useState('');
  
  // Historical game viewer
  const [allGames, setAllGames] = useState([]);
  const [gameSearchTerm, setGameSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [gameStats, setGameStats] = useState([]);
  const [gameRounds, setGameRounds] = useState([]);
  const [gameChartData, setGameChartData] = useState([]);

  useEffect(() => {
    loadPlayers();
    loadAllGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload games when navigating back to Stats (e.g., after finishing a game)
  useEffect(() => {
    if (location.pathname === '/stats') {
      console.log('Navigated to Stats, reloading games...');
      loadAllGames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Debounce search term
  useEffect(() => {
    const debounceMs = getSetting('search.debounce_ms', 300);
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(gameSearchTerm);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [gameSearchTerm]);

  const loadAllGames = async () => {
    try {
      const res = await gamesApi.getAll(false); // Get all games, not just active
      console.log('All games from API:', res.data);
      
      // Filter to only non-active games (finished or cancelled) and sort by ID descending (most recent first)
      const completedGames = res.data
        .filter(g => !g.is_active)  // Show all non-active games
        .sort((a, b) => b.id - a.id);  // Sort by ID descending
      
      console.log('Filtered completed games:', completedGames);
      console.log('Game details:', completedGames.map(g => ({
        id: g.id,
        is_active: g.is_active,
        is_valid: g.is_valid,
        date: g.date
      })));
      
      setAllGames(completedGames);
    } catch (error) {
      console.error('Error loading games:', error);
    }
  };

  const loadPlayers = async () => {
    try {
      const res = await playersApi.getAll();
      setPlayers(res.data);
      
      if (res.data.length > 0) {
        // Fetch stats for all players to find highest win rate
        const statsPromises = res.data.map(p => playersApi.getStats(p.id));
        const statsResults = await Promise.all(statsPromises);
        
        // Find player with highest win rate
        let highestWinRatePlayer = res.data[0];
        let highestWinRate = -1;
        
        statsResults.forEach((result, idx) => {
          if (result.data.win_rate > highestWinRate) {
            highestWinRate = result.data.win_rate;
            highestWinRatePlayer = res.data[idx];
          }
        });
        
        console.log(`Selected player with highest win rate: ${highestWinRatePlayer.alias} (${highestWinRate.toFixed(1)}%)`);
        setSelectedPlayerIds([highestWinRatePlayer.id]);
        await loadPlayerStats([highestWinRatePlayer.id]);
      }
    } catch (error) {
      console.error('Error loading players:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerStats = async (playerIds) => {
    if (!playerIds || playerIds.length === 0) {
      setPlayerStats(null);
      setBetDistribution([]);
      return;
    }

    try {
      // Fetch stats for all selected players
      const statsPromises = playerIds.map(id => playersApi.getStats(id));
      const distPromises = playerIds.map(id => playersApi.getBetDistribution(id));
      
      const statsResults = await Promise.all(statsPromises);
      const distResults = await Promise.all(distPromises);
      
      // Combine stats
      const combinedStats = {
        player_id: playerIds.length === 1 ? playerIds[0] : null,
        player_alias: playerIds.length === 1 
          ? players.find(p => p.id === playerIds[0])?.alias 
          : `${playerIds.length} players combined`,
        games_played: statsResults.reduce((sum, r) => sum + r.data.games_played, 0),
        total_rounds: statsResults.reduce((sum, r) => sum + r.data.total_rounds, 0),
        total_score: statsResults.reduce((sum, r) => sum + r.data.total_score, 0),
        successful_bets: statsResults.reduce((sum, r) => sum + r.data.successful_bets, 0),
        failed_bets: statsResults.reduce((sum, r) => sum + r.data.failed_bets, 0),
        average_bet: 0,
        win_rate: 0
      };
      
      // Calculate averages
      const totalBetSum = statsResults.reduce((sum, r) => sum + (r.data.average_bet * r.data.total_rounds), 0);
      combinedStats.average_bet = combinedStats.total_rounds > 0 ? totalBetSum / combinedStats.total_rounds : 0;
      combinedStats.win_rate = combinedStats.total_rounds > 0 
        ? (combinedStats.successful_bets / combinedStats.total_rounds) * 100 
        : 0;
      
      setPlayerStats(combinedStats);
      
      // Combine bet distributions
      const combinedDist = {};
      distResults.forEach(result => {
        result.data.forEach(item => {
          if (!combinedDist[item.bet]) {
            combinedDist[item.bet] = 0;
          }
          combinedDist[item.bet] += item.count;
        });
      });
      
      const distArray = Object.entries(combinedDist)
        .map(([bet, count]) => ({ bet: parseInt(bet), count }))
        .sort((a, b) => a.bet - b.bet);
      
      setBetDistribution(distArray);
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
      setSelectedGameId(null);
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
      setSelectedGameId(gameId);
      
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

  const handleEditGame = async (gameId) => {
    if (!window.confirm('Reactivate this game for editing? You can modify rounds and finish it again.')) {
      return;
    }

    try {
      // Reactivate the game
      await gamesApi.reactivate(gameId);
      
      // Navigate to Play Game page (root path)
      navigate('/');
    } catch (error) {
      console.error('Error reactivating game:', error);
      alert('Error reactivating game. Please try again.');
    }
  };

  // Filter games based on search term (including status as searchable text)
  // If no search term, show only the most recent N games (configurable)
  const displayGames = useMemo(() => {
    const defaultRecentGames = getSetting('display.default_recent_games', 5);
    
    const filtered = allGames.filter(game => {
      if (!debouncedSearchTerm) return true;
      
      const searchLower = debouncedSearchTerm.toLowerCase();
      const gameDate = new Date(game.date).toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Status as searchable text
      const status = game.is_valid ? 'finished' : 'unfinished';
      
      return (
        game.id.toString().includes(searchLower) ||
        gameDate.toLowerCase().includes(searchLower) ||
        status.includes(searchLower) ||
        (game.notes && game.notes.toLowerCase().includes(searchLower)) ||
        (game.location && game.location.toLowerCase().includes(searchLower))
      );
    });

    // When not searching, limit to most recent N games
    return debouncedSearchTerm ? filtered : filtered.slice(0, defaultRecentGames);
  }, [allGames, debouncedSearchTerm]);

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
        
        <div className="form-group">
          <label>Search Players:</label>
          <input
            type="text"
            placeholder="Filter players by name..."
            value={playerSearchTerm}
            onChange={(e) => setPlayerSearchTerm(e.target.value)}
            style={{ marginBottom: '10px' }}
          />
        </div>

        <div className="form-group">
          <label>
            Select Players ({players.filter(p => 
              !playerSearchTerm ||
              p.alias.toLowerCase().includes(playerSearchTerm.toLowerCase()) ||
              (p.first_name && p.first_name.toLowerCase().includes(playerSearchTerm.toLowerCase())) ||
              (p.last_name && p.last_name.toLowerCase().includes(playerSearchTerm.toLowerCase()))
            ).length} matching):
          </label>
          <select 
            value=""
            onChange={(e) => {
              const playerId = parseInt(e.target.value);
              if (playerId && !selectedPlayerIds.includes(playerId)) {
                const newSelection = [...selectedPlayerIds, playerId];
                setSelectedPlayerIds(newSelection);
                loadPlayerStats(newSelection);
                setPlayerSearchTerm(''); // Clear search after selection
              }
            }}
            size={Math.min(players.filter(p => 
              !selectedPlayerIds.includes(p.id) &&
              (!playerSearchTerm ||
              p.alias.toLowerCase().includes(playerSearchTerm.toLowerCase()) ||
              (p.first_name && p.first_name.toLowerCase().includes(playerSearchTerm.toLowerCase())) ||
              (p.last_name && p.last_name.toLowerCase().includes(playerSearchTerm.toLowerCase())))
            ).length + 1, 6)}
          >
            <option value="">-- Select a player to add --</option>
            {players
              .filter(p => 
                !selectedPlayerIds.includes(p.id) &&
                (!playerSearchTerm ||
                p.alias.toLowerCase().includes(playerSearchTerm.toLowerCase()) ||
                (p.first_name && p.first_name.toLowerCase().includes(playerSearchTerm.toLowerCase())) ||
                (p.last_name && p.last_name.toLowerCase().includes(playerSearchTerm.toLowerCase())))
              )
              .map(player => (
                <option key={player.id} value={player.id}>
                  {player.alias}
                  {(player.first_name || player.last_name) && 
                    ` (${[player.first_name, player.last_name].filter(Boolean).join(' ')})`
                  }
                </option>
              ))
            }
          </select>
        </div>

        {/* Selected players list */}
        <div style={{ 
          border: '2px solid #00ff00', 
          padding: '10px', 
          margin: '10px 0',
          background: '#16213e',
          minHeight: '60px'
        }}>
          <div style={{ color: '#00ff00', marginBottom: '10px', fontSize: '0.9rem', opacity: 0.7 }}>
            Selected Players ({selectedPlayerIds.length}):
          </div>
          {selectedPlayerIds.length === 0 ? (
            <div style={{ color: '#00ff00', opacity: 0.5, textAlign: 'center', padding: '10px' }}>
              No players selected
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {selectedPlayerIds.map(playerId => {
                const player = players.find(p => p.id === playerId);
                if (!player) return null;
                return (
                  <div 
                    key={playerId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 10px',
                      background: '#0a0e27',
                      border: '1px solid #00ff00',
                      borderRadius: '4px'
                    }}
                  >
                    <span style={{ color: '#00ff00' }}>
                      {player.alias}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newSelection = selectedPlayerIds.filter(id => id !== playerId);
                        setSelectedPlayerIds(newSelection);
                        loadPlayerStats(newSelection);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff0000',
                        cursor: 'pointer',
                        padding: '0 5px',
                        fontSize: '1.2rem',
                        lineHeight: '1'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
          <label>Search Games:</label>
          <input
            type="text"
            placeholder="Filter by ID, date, status (finished/unfinished), notes, location..."
            value={gameSearchTerm}
            onChange={(e) => setGameSearchTerm(e.target.value)}
            style={{ marginBottom: '15px' }}
          />
        </div>

        {allGames.length === 0 ? (
          <p style={{ marginTop: '20px', color: '#666', textAlign: 'center' }}>
            No completed games available yet
          </p>
        ) : (
          <>
            <div className="form-group">
              <label>
                {debouncedSearchTerm 
                  ? `Select Game (${displayGames.length} matching):` 
                  : `Select Game (showing ${displayGames.length} most recent):`
                }
              </label>
              <select
                value={selectedGameId || ''}
                onChange={(e) => {
                  const gameId = parseInt(e.target.value);
                  if (gameId) {
                    selectGame(gameId);
                  }
                }}
                style={{ width: '100%' }}
                size={Math.min(displayGames.length + 1, 6)}
              >
                <option value="">-- Select a game --</option>
                {displayGames.map(game => {
                  const gameDate = new Date(game.date).toLocaleString('en-GB', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  
                  return (
                    <option key={game.id} value={game.id}>
                      Game #{game.id} - {gameDate}{game.notes ? ` - ${game.notes}` : ''}
                    </option>
                  );
                })}
              </select>
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
                      <strong>Status:</strong>{' '}
                      <span style={{ color: gameDetails.is_valid ? '#00ff00' : '#ffff00' }}>
                        {gameDetails.is_valid ? 'FINISHED' : 'UNFINISHED'}
                      </span>
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
                  
                  {/* Edit Game Button */}
                  <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #00ff00' }}>
                    <button
                      onClick={() => handleEditGame(gameDetails.id)}
                      style={{ padding: '10px 20px' }}
                    >
                      ✏️ EDIT GAME
                    </button>
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
                                ? `${((stat.successful_bets / stat.rounds_played) * 100).toFixed(1)}%`
                                : '0%'}
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

            {displayGames.length === 0 && debouncedSearchTerm && (
              <p style={{ marginTop: '20px', color: '#ff6600', textAlign: 'center' }}>
                No games match "{debouncedSearchTerm}"
              </p>
            )}

            {!gameDetails && displayGames.length > 0 && (
              <p style={{ marginTop: '20px', color: '#666', textAlign: 'center' }}>
                Select a game from the list to view its statistics
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Stats;
