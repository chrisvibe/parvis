import React, { useState } from 'react';
import { getSetting } from '../utils/settings';
import { gamesApi } from '../api';
import '../styles/GameMatrix.css';

function GameMatrix({ 
  game, 
  players, 
  rounds, 
  onRoundsUpdate,
  onReload
}) {
  const [mode, setMode] = useState('bets');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  
  // Build matrix from rounds data
  const matrix = React.useMemo(() => {
    if (!players || players.length === 0) {
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
    return m;
  }, [rounds, players, game.total_rounds]);

  // Calculate totals
  const totals = React.useMemo(() => {
    return players.map(player => {
      const playerRounds = rounds.filter(r => r.player_id === player.player_id);
      return playerRounds.reduce((sum, r) => sum + (r.score || 0), 0);
    });
  }, [rounds, players]);

  const handleNextRound = async () => {
    if (!game || game.current_round >= game.total_rounds) return;
    
    // Step 1: Increment the counter first
    await gamesApi.incrementRound(game.id);
    
    // Step 2: Initialize the NEW current_round with zeroes
    const newRound = game.current_round + 1; // This will match what backend just incremented to
    await Promise.all(
      players.map(player => 
        gamesApi.upsertRound(game.id, newRound, player.player_id, 0, false)
      )
    );
    
    // Step 3: Reload data
    if (onReload) {
      await onReload();
    }
    
    // Switch back to edit bets mode
    setMode('bets');
  };

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
        updateCell(roundIdx, playerIdx, cell.bet, !cell.success);
      }
    }
  };

  const updateCell = async (roundIdx, playerIdx, bet, success) => {
    const roundNumber = roundIdx + 1;
    const playerId = players[playerIdx].player_id;
    
    const roundData = {
      round: roundNumber,
      playerId: playerId,
      bet: parseInt(bet),
      success: success
    };

    await onRoundsUpdate(roundData);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      const numValue = parseInt(value);
      const roundNumber = editingCell.round + 1;
      
      if (value === '' || (numValue >= 0 && numValue <= roundNumber)) {
        setEditValue(value);
      }
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
    const isFutureRound = (roundIdx + 1) > game.current_round;
    
    let backgroundColor = matrixColors.cell_empty;
    let color = '#00ff00';
    let borderWidth = matrixColors.cell_border || '1px';
    let borderColor = '#00ff00';
    
    if (isPriority) {
      borderWidth = matrixColors.cell_priority_border || '3px';
      borderColor = matrixColors.cell_priority || '#00ffff';
    }
    
    if (isFutureRound) {
      backgroundColor = '#0a0a0a';
      color = '#333';
    } else if (cell.bet !== null) {
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
      borderColor,
      borderStyle: 'solid',
      pointerEvents: isFutureRound ? 'none' : 'auto',
      opacity: isFutureRound ? 0.3 : 1
    };
  };

  const getCellDisplay = (cell) => {
    if (cell.bet === null) return '-';
    
    if (mode === 'bets') {
      return cell.bet;
    }
    
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
        {mode === 'results' && game.current_round < game.total_rounds && (
          <button 
            onClick={handleNextRound}
            style={{ marginLeft: 'auto', background: '#00ff00', color: '#0a0e27' }}
          >
            ⏭️ NEXT ROUND
          </button>
        )}
        <div className="mode-indicator">
          Current Round: {game.current_round}/{game.total_rounds} | 
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
                <td 
                  className="round-label"
                  style={{
                    backgroundColor: (roundIdx + 1) === game.current_round ? '#ffff00' : undefined,
                    color: (roundIdx + 1) === game.current_round ? '#0a0e27' : undefined,
                    fontWeight: (roundIdx + 1) === game.current_round ? 'bold' : undefined
                  }}
                >
                  {roundIdx + 1}
                </td>
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
