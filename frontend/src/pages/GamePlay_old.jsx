import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { gamesApi, playersApi } from '../api';

function GamePlay() {
  const [players, setPlayers] = useState([]);
  const [activeGame, setActiveGame] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [gameStats, setGameStats] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New game form
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [totalRounds, setTotalRounds] = useState(10);
  
  // Round input
  const [currentBets, setCurrentBets] = useState({});

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [playersRes, gamesRes] = await Promise.all([
        playersApi.getAll(),
        gamesApi.getAll(true)
      ]);
      
      setPlayers(playersRes.data);
      
      if (gamesRes.data.length > 0) {
        const game = gamesRes.data[0];
        setActiveGame(game);
        await loadGameData(game.id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGameData = async (gameId) => {
    try {
      const [roundsRes, statsRes] = await Promise.all([
        gamesApi.getRounds(gameId),
        gamesApi.getStats(gameId)
      ]);
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
      };
      const res = await gamesApi.create(gameData);
      setActiveGame(res.data);
      setRounds([]);
      setGameStats([]);
      setCurrentBets({});
    } catch (error) {
      console.error('Error creating game:', error);
      alert('Error creating game');
    }
  };

  const addRound = async () => {
    if (!activeGame) return;

    const gamePlayers = gameStats.map(s => s.player_id);
    const bets = gamePlayers.map(playerId => ({
      player_id: playerId,
      bet: parseInt(currentBets[playerId]?.bet || 0),
      success: currentBets[playerId]?.success === true
    }));

    // Validate all bets are entered
    if (bets.some(b => !b.bet)) {
      alert('Enter all bets');
      return;
    }

    try {
      await gamesApi.addRound(activeGame.id, { bets });
      await loadGameData(activeGame.id);
      setCurrentBets({});
    } catch (error) {
      console.error('Error adding round:', error);
      alert('Error adding round');
    }
  };

  const finishGame = async () => {
    if (!activeGame) return;
    if (!window.confirm('Finish this game?')) return;

    try {
      await gamesApi.finish(activeGame.id);
      setActiveGame(null);
      setRounds([]);
      setGameStats([]);
      setCurrentBets({});
    } catch (error) {
      console.error('Error finishing game:', error);
    }
  };

  // Prepare chart data
  const chartData = React.useMemo(() => {
    if (!rounds.length || !gameStats.length) return [];

    const maxRound = Math.max(...rounds.map(r => r.round_number));
    const data = [];

    for (let round = 1; round <= maxRound; round++) {
      const roundData = { round };
      
      gameStats.forEach(stat => {
        const playerRounds = rounds.filter(
          r => r.player_id === stat.player_id && r.round_number <= round
        );
        const score = playerRounds.reduce((sum, r) => sum + r.score, 0);
        roundData[stat.player_alias] = score;
      });
      
      data.push(roundData);
    }

    return data;
  }, [rounds, gameStats]);

  const colors = ['#00ff00', '#00ffff', '#ff00ff', '#ffff00', '#ff8800', '#8800ff'];

  if (loading) return <div className="loading">LOADING...</div>;

  if (!activeGame) {
    return (
      <div className="card">
        <h2>START NEW GAME</h2>
        
        {players.length === 0 ? (
          <div className="error">
            No players registered. Go to PLAYERS page to add players.
          </div>
        ) : (
          <>
            <label>SELECT PLAYERS (minimum 2)</label>
            <div style={{ maxHeight: '300px', overflow: 'auto', border: '2px solid #00ff00', padding: '10px', margin: '10px 0' }}>
              {players.map(player => (
                <label key={player.id} style={{ display: 'block', cursor: 'pointer', padding: '5px' }}>
                  <input
                    type="checkbox"
                    checked={selectedPlayers.includes(player.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPlayers([...selectedPlayers, player.id]);
                      } else {
                        setSelectedPlayers(selectedPlayers.filter(id => id !== player.id));
                      }
                    }}
                  />
                  {' '}{player.alias}
                </label>
              ))}
            </div>

            <label>NUMBER OF ROUNDS</label>
            <input
              type="number"
              min="1"
              value={totalRounds}
              onChange={(e) => setTotalRounds(e.target.value)}
            />

            <button onClick={createGame} style={{ marginTop: '20px' }}>
              START GAME
            </button>
          </>
        )}
      </div>
    );
  }

  const gamePlayers = gameStats.length > 0 
    ? gameStats 
    : players.filter(p => selectedPlayers.includes(p.id)).map(p => ({
        player_id: p.id,
        player_alias: p.alias,
        total_score: 0
      }));

  return (
    <div>
      <div className="card">
        <h2>GAME IN PROGRESS - Round {activeGame.current_round}/{activeGame.total_rounds}</h2>
        
        <button onClick={finishGame} className="danger" style={{ marginBottom: '20px' }}>
          FINISH GAME
        </button>

        {/* Current Scores */}
        <div className="stat-grid">
          {gameStats.map(stat => (
            <div key={stat.player_id} className="stat-box">
              <div className="label">{stat.player_alias}</div>
              <div className="value">{stat.total_score}</div>
            </div>
          ))}
        </div>

        {/* Live Chart */}
        {chartData.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#00ff00', marginBottom: '20px' }}>SCORE PROGRESSION</h3>
            <ResponsiveContainer width="100%" height={300}>
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
                    background: '#0a0e27', 
                    border: '2px solid #00ff00',
                    fontFamily: 'Courier New',
                    color: '#00ff00'
                  }}
                />
                <Legend 
                  wrapperStyle={{ 
                    fontFamily: 'Courier New',
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

        {/* Round Input */}
        {activeGame.current_round < activeGame.total_rounds && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#00ff00', marginBottom: '15px' }}>
              ENTER ROUND {activeGame.current_round + 1} RESULTS
            </h3>
            
            <table>
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>BET</th>
                  <th>SUCCESS?</th>
                </tr>
              </thead>
              <tbody>
                {gamePlayers.map(player => (
                  <tr key={player.player_id}>
                    <td>{player.player_alias}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={currentBets[player.player_id]?.bet || ''}
                        onChange={(e) => setCurrentBets({
                          ...currentBets,
                          [player.player_id]: {
                            ...currentBets[player.player_id],
                            bet: e.target.value
                          }
                        })}
                        style={{ width: '80px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={currentBets[player.player_id]?.success || false}
                        onChange={(e) => setCurrentBets({
                          ...currentBets,
                          [player.player_id]: {
                            ...currentBets[player.player_id],
                            success: e.target.checked
                          }
                        })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button onClick={addRound} style={{ marginTop: '15px' }}>
              SUBMIT ROUND
            </button>
          </div>
        )}

        {activeGame.current_round >= activeGame.total_rounds && (
          <div className="success" style={{ marginTop: '30px' }}>
            GAME COMPLETE! All {activeGame.total_rounds} rounds finished.
          </div>
        )}
      </div>
    </div>
  );
}

export default GamePlay;
