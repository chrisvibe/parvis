import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { gamesApi, playersApi } from '../api';
import { useLocation, useNavigate } from 'react-router-dom';
import FamilyTreeSelector from '../components/FamilyTreeSelector';
import GameMatrix from '../components/GameMatrix';
import { getSetting } from '../utils/settings';

function GamePlay() {
  const location = useLocation();
  const navigate = useNavigate();
  const loadingRef = React.useRef(false); // Track if we're already loading
  const [players, setPlayers] = useState([]);
  const [activeGame, setActiveGame] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [gameStats, setGameStats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New game form
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [totalRounds, setTotalRounds] = useState(getSetting('game.default_rounds', 10));
  const [gameNotes, setGameNotes] = useState('');
  const [gameLocation, setGameLocation] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when navigating to this route (e.g., from Stats after editing)
  useEffect(() => {
    // Only reload if we're actually on the root route
    if (location.pathname === '/') {
      console.log('Route changed to play, reloading...');
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]); // Use location.key instead of pathname to detect actual navigation

  const loadData = async () => {
    if (loadingRef.current) {
      console.log('Already loading, skipping...');
      return;
    }
    
    try {
      loadingRef.current = true;
      setLoading(true);
      console.log('Loading data...');
      const [playersRes, gamesRes] = await Promise.all([
        playersApi.getAll(),
        gamesApi.getAll(true)
      ]);
      
      console.log('Active games response:', gamesRes.data);
      setPlayers(playersRes.data);
      
      if (gamesRes.data.length > 0) {
        const game = gamesRes.data[0];
        console.log('Found active game:', game);
        setActiveGame(game);
        await loadGameData(game.id);
      } else {
        console.log('No active games found');
        setActiveGame(null);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const loadGameData = async (gameId) => {
    try {
      const [gameRes, roundsRes, statsRes] = await Promise.all([
        gamesApi.get(gameId),
        gamesApi.getRounds(gameId),
        gamesApi.getStats(gameId)
      ]);
      setActiveGame(gameRes.data);  // Update game object with new current_round
      setRounds(roundsRes.data);
      setGameStats(statsRes.data);
    } catch (error) {
      console.error('Error loading game data:', error);
    }
  };

  const createGame = async () => {
    if (selectedPlayers.length < 2) {
      alert('Select at least 2 players');
      return;
    }

    try {
      const gameData = {
        player_ids: selectedPlayers,
        total_rounds: parseInt(totalRounds),
        notes: gameNotes || null,
        location: gameLocation || null
      };
      const res = await gamesApi.create(gameData);
      setActiveGame(res.data);
      setRounds([]);
      
      // Initialize Round 1 with bet=0 for all players (batched)
      await Promise.all(
        selectedPlayers.map(playerId =>
          gamesApi.upsertRound(res.data.id, 1, playerId, 0, false)
        )
      );
      
      setSelectedPlayers([]);
      setGameNotes('');
      setGameLocation('');
      
      // Load game data ONCE after all initializations
      await loadGameData(res.data.id);
    } catch (error) {
      console.error('Error creating game:', error);
      alert('Error creating game');
    }
  };

  const handleRoundUpdate = async (roundData) => {
    if (!activeGame) return;

    try {
      await gamesApi.upsertRound(
        activeGame.id,
        roundData.round,
        roundData.playerId,
        roundData.bet,
        roundData.success
      );

      // Reload game data
      await loadGameData(activeGame.id);
    } catch (error) {
      console.error('Error updating round:', error);
      alert('Error updating round');
    }
  };

  const finishGame = async () => {
    if (!activeGame) return;
    
    if (window.confirm('Finish this game? This will mark it as complete and count toward statistics.')) {
      try {
        console.log('Finishing game:', activeGame.id);
        const response = await gamesApi.finish(activeGame.id);
        console.log('Finish game response:', response);
        
        // Clear active game
        setActiveGame(null);
        setRounds([]);
        setGameStats([]);
        
        // Small delay to ensure DB commits, then navigate to stats
        setTimeout(() => {
          navigate('/stats');
        }, 300);
      } catch (error) {
        console.error('Error finishing game:', error);
        alert('Error finishing game');
      }
    }
  };

  const cancelGame = async () => {
    if (!activeGame) return;
    
    if (window.confirm('Cancel this game? It will not count toward statistics.')) {
      try {
        await gamesApi.cancel(activeGame.id);
        setActiveGame(null);
        setRounds([]);
        setGameStats([]);
      } catch (error) {
        console.error('Error cancelling game:', error);
        alert('Error cancelling game');
      }
    }
  };

  const adjustRounds = async () => {
    if (!activeGame) return;
    
    const newTotal = prompt(`Adjust total rounds (currently ${activeGame.total_rounds}):`, activeGame.total_rounds);
    if (newTotal !== null) {
      const num = parseInt(newTotal);
      if (isNaN(num) || num < 1) {
        alert('Please enter a valid number (at least 1)');
        return;
      }
      
      try {
        await gamesApi.adjustRounds(activeGame.id, num);
        await loadGameData(activeGame.id);
      } catch (error) {
        console.error('Error adjusting rounds:', error);
        alert('Error adjusting rounds');
      }
    }
  };

  const editMetadata = async () => {
    if (!activeGame) return;
    
    const newNotes = prompt('Game Notes:', activeGame.notes || '');
    const newLocation = prompt('Game Location:', activeGame.location || '');
    
    if (newNotes === null && newLocation === null) return; // User cancelled
    
    try {
      await gamesApi.updateMetadata(activeGame.id, {
        notes: newNotes === null ? activeGame.notes : newNotes,
        location: newLocation === null ? activeGame.location : newLocation
      });
      await loadGameData(activeGame.id);
    } catch (error) {
      console.error('Error updating metadata:', error);
      alert('Error updating game metadata');
    }
  };

  // Chart data
  const chartData = React.useMemo(() => {
    if (!gameStats.length || !rounds.length || !activeGame) return [];

    // Use game.total_rounds instead of maxRound from data
    const data = [];

    for (let i = 1; i <= activeGame.total_rounds; i++) {
      const point = { round: i };
      
      gameStats.forEach(stat => {
        const playerRounds = rounds
          .filter(r => r.player_id === stat.player_id && r.round_number <= i)
          .reduce((sum, r) => sum + (r.score || 0), 0);
        point[stat.player_alias] = playerRounds;
      });
      
      data.push(point);
    }

    return data;
  }, [rounds, gameStats, activeGame]);

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

          <button onClick={createGame} disabled={selectedPlayers.length < 2}>
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
            onRoundsUpdate={handleRoundUpdate}
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
