import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { color, chartTooltipStyle, chartAxisLabel } from '../utils/theme';

/**
 * How often each bet size was chosen.
 *
 * @param {Array} distribution - [{ bet, count }], ordered by bet
 */
function BetDistributionChart({ distribution }) {
  if (!distribution?.length) {
    return null;
  }

  return (
    <div className="section wide">
      <h3>BET DISTRIBUTION</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={distribution}>
          <CartesianGrid strokeDasharray="3 3" stroke={color('--fg')} opacity={0.2} />
          <XAxis
            dataKey="bet"
            stroke={color('--fg')}
            label={chartAxisLabel('Bet Amount', { position: 'insideBottom', offset: -5 })}
          />
          <YAxis
            stroke={color('--fg')}
            label={chartAxisLabel('Frequency', { angle: -90, position: 'insideLeft' })}
          />
          <Tooltip contentStyle={chartTooltipStyle()} />
          <Bar dataKey="count" fill={color('--fg')} name="Times Bet" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BetDistributionChart;
