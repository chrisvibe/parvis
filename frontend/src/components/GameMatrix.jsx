import React, { useState, useEffect } from 'react';
import { getSetting } from '../utils/settings';
import '../styles/GameMatrix.css';

function GameMatrix({ 
  game, 
  players, 
  rounds, 
  onRoundsUpdate 
}) {
  const [mode, setMode] = useState('bets'); // 'bets' or 'results'
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  
  // Debug logging
  React.useEffect(() => {
    console.log('GameMatrix received:', { 
      game, 
      players, 
      playersLength: players?.length,
      rounds 
    });
  }, [game, players, rounds]);
  
  // Build matrix from rounds data
  const matrix = React.useMemo(() => {
    if (!players || players.length === 0) {
      console.log('No players available for matrix');
      return [];
    }
    
    const m = [];
    for (let r = 0; r < game.total_rounds; r++) {
      const row = [];
      for (let p = 0; p < players.length; p++) {
        const round = rounds.find(
          rd => rd.round_number === r + 1 && rd.player_id === players[p].player_id
        );
        row.push({
          round: r + 1,
          playerId: players[p].player_id,
          bet: round?.bet ?? null,
          success: round?.success ?? false,
          score: round?.score ?? null
        });
      }
      m.push(row);
    }
    console.log('Built matrix:', m);
    return m;
  }, [rounds, players, game.total_rounds]);

  // Calculate totals
  const totals = React.useMemo(() => {
    return players.map(player => {
      const playerRounds = rounds.filter(r => r.player_id === player.player_id);
      return playerRounds.reduce((sum, r) => sum + (r.score || 0), 0);
    });
  }, [rounds, players]);

  const handleCellClick = (roundIdx, playerIdx) => {
    if (mode === 'bets') {
      const cell = matrix[roundIdx][playerIdx];
      setEditingCell({ round: roundIdx, player: playerIdx });
      setEditValue(cell.bet !== null ? String(cell.bet) : '');
    }
  };

  const handleCellDoubleClick = (roundIdx, playerIdx) => {
    if (mode === 'results') {
      const cell = matrix[roundIdx][playerIdx];
      if (cell.bet !== null) {
        // Toggle success
        updateCell(roundIdx, playerIdx, cell.bet, !cell.success);
      }
    }
  };

  const updateCell = async (roundIdx, playerIdx, bet, success) => {
    const roundNumber = roundIdx + 1;
    const playerId = players[playerIdx].player_id;
    const score = success ? (10 + parseInt(bet)) : 0;
    
    // Find existing round or create new
    const existingRound = rounds.find(
      r => r.round_number === roundNumber && r.player_id === playerId
    );

    const roundData = {
      round_number: roundNumber,
      player_id: playerId,
      bet: parseInt(bet),
      success: success,
      score: score
    };

    await onRoundsUpdate(roundData, existingRound?.id);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setEditValue(value);
    }
  };

  const handleInputBlur = async () => {
    if (editingCell) {
      const { round, player } = editingCell;
      const bet = editValue === '' ? 0 : parseInt(editValue);
      const cell = matrix[round][player];
      await updateCell(round, player, bet, cell.success);
      setEditingCell(null);
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const getCellStyle = (roundIdx, playerIdx, cell) => {
    const matrixColors = getSetting('matrix', {});
    const isPriority = (roundIdx % players.length) === playerIdx;
    
    let backgroundColor = matrixColors.cell_empty;
    let color = '#00ff00';
    let borderWidth = matrixColors.cell_border || '1px';
    
    if (isPriority) {
      borderWidth = matrixColors.cell_priority_border || '3px';
    }
    
    if (cell.bet !== null) {
      if (cell.success) {
        backgroundColor = matrixColors.cell_success;
        color = '#0a0e27';
      } else if (cell.score !== null) {
        backgroundColor = matrixColors.cell_failed;
        color = '#fff';
      } else {
        backgroundColor = matrixColors.cell_bet_pending;
        color = '#0a0e27';
      }
    }
    
    return {
      backgroundColor,
      color,
      borderWidth,
      borderColor: isPriority ? matrixColors.cell_priority : '#00ff00'
    };
  };

  const getCellDisplay = (cell) => {
    if (cell.bet === null) return '-';
    if (cell.score !== null) {
      return cell.success ? cell.score : '0';
    }
    return cell.bet;
  };

  if (!players || players.length === 0) {
    return (
      <div className="game-matrix-container">
        <div className="matrix-controls">
          <p style={{color: '#ff0000'}}>Loading players...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-matrix-container">
      <div className="matrix-controls">
        <button 
          onClick={() => setMode('bets')}
          className={mode === 'bets' ? 'active' : ''}
        >
          📝 EDIT BETS
        </button>
        <button 
          onClick={() => setMode('results')}
          className={mode === 'results' ? 'active' : ''}
        >
          ✓ MARK RESULTS
        </button>
        <div className="mode-indicator">
          Mode: {mode === 'bets' ? 'Bet Entry' : 'Mark Success/Fail (double-click)'}
        </div>
      </div>

      <div className="matrix-wrapper">
        <table className="game-matrix">
          <thead>
            <tr>
              <th>Round</th>
              {players.map(player => (
                <th key={player.player_id}>{player.player_alias}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, roundIdx) => (
              <tr key={roundIdx}>
                <td className="round-label">{roundIdx + 1}</td>
                {row.map((cell, playerIdx) => {
                  const isEditing = editingCell?.round === roundIdx && editingCell?.player === playerIdx;
                  const isPriority = (roundIdx % players.length) === playerIdx;
                  
                  return (
                    <td
                      key={playerIdx}
                      className={`matrix-cell ${isPriority ? 'priority' : ''}`}
                      style={getCellStyle(roundIdx, playerIdx, cell)}
                      onClick={() => handleCellClick(roundIdx, playerIdx)}
                      onDoubleClick={() => handleCellDoubleClick(roundIdx, playerIdx)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={handleInputChange}
                          onBlur={handleInputBlur}
                          onKeyDown={handleInputKeyDown}
                          autoFocus
                          className="cell-input"
                        />
                      ) : (
                        getCellDisplay(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="total-label">TOTAL</td>
              {totals.map((total, idx) => (
                <td key={idx} className="total-cell">
                  {total}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default GameMatrix;
