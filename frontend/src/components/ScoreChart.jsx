import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { color, chartLineColor, chartTooltipStyle, chartAxisLabel } from '../utils/theme';

/**
 * ScoreChart - Visualizes cumulative scores over rounds.
 *
 * Used by both the live game and the historical game viewer, which each had
 * their own line chart before, with different colours and different tooltips.
 *
 * @param {Array} chartData - Chart data with round and player scores
 * @param {Array} gameStats - Player statistics for generating lines
 * @param {String} title - heading above the chart
 * @param {Boolean} showLegend - draw the player legend (the live game has the
 *        matrix directly above it and does not need one)
 */
function ScoreChart({ chartData, gameStats, title = '📊 Score Progress', showLegend = false }) {
  if (!chartData?.length || !gameStats?.length) {
    return null;
  }

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={color('--fg')} opacity={0.2} />
          <XAxis
            dataKey="round"
            stroke={color('--fg')}
            label={chartAxisLabel('Round', { position: 'insideBottom', offset: -5 })}
          />
          <YAxis
            stroke={color('--fg')}
            label={chartAxisLabel('Score', { angle: -90, position: 'insideLeft' })}
          />
          <Tooltip contentStyle={chartTooltipStyle()} />
          {showLegend && <Legend />}
          {gameStats.map((stat, index) => {
            const lineColor = chartLineColor(index, gameStats.length);
            return (
              <Line
                key={stat.player_id}
                type="monotone"
                dataKey={stat.player_alias}
                stroke={lineColor}
                strokeWidth={2}
                dot={{ fill: lineColor, r: 4 }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ScoreChart;
