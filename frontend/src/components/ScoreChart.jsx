import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * ScoreChart - Visualizes cumulative scores over rounds.
 * 
 * Displays a line chart showing each player's score progression.
 * 
 * @param {Array} chartData - Chart data with round and player scores
 * @param {Array} gameStats - Player statistics for generating lines
 * @param {Array} colors - Array of colors for lines (optional)
 */
function ScoreChart({ chartData, gameStats, colors }) {
  if (!chartData || chartData.length === 0 || !gameStats || gameStats.length === 0) {
    return null;
  }

  // Default colors if not provided
  const defaultColors = ['#00ff00', '#ffff00', '#00ffff', '#ff00ff', '#ff8800'];
  const lineColors = colors || defaultColors;

  return (
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
              stroke={lineColors[idx % lineColors.length]}
              strokeWidth={2}
              dot={{ fill: lineColors[idx % lineColors.length], r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ScoreChart;
