import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { playersApi } from '../api';

function Stats() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [betDistribution, setBetDistribution] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    </div>
  );
}

export default Stats;
