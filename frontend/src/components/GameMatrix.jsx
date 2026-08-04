import React, { useState } from 'react';
import { gamesApi } from '../api';
import { defaultSuccess } from '../utils/gameRules';
import { moveItem, sameOrder } from '../utils/reorder';
import '../styles/GameMatrix.css';

function GameMatrix({
  game,
  players,
  rounds,
  onRoundsUpdate,
  onReload,
  onFinishGame,
  onReorderPlayers,
}) {
  const [mode, setMode] = useState('bets');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  // Which column is being dragged. Held here rather than read back out of the
  // drag event because Firefox will not let you read dataTransfer during
  // dragover, which is exactly when the drop target needs to know.
  const [draggingSeat, setDraggingSeat] = useState(null);
  const [dropTargetSeat, setDropTargetSeat] = useState(null);

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
    
    // Step 2: Open the NEW current_round for everyone. Same starting state as
    // round 1 gets at game creation — see utils/gameRules.
    const newRound = game.current_round + 1; // This will match what backend just incremented to
    await Promise.all(
      players.map(player =>
        gamesApi.upsertRound(game.id, newRound, player.player_id, 0, defaultSuccess())
      )
    );
    
    // Step 3: Reload data
    if (onReload) {
      await onReload();
    }
    
    // Switch back to edit bets mode
    setMode('bets');
  };

  // ---------------------------------------------------------------------
  // Column order
  //
  // The order is not decoration: the highlighted diagonal below says whose
  // round it is, and it is read straight off the column index. So a reorder is
  // a change to the game, saved to the server rather than kept in this browser.
  //
  // Dragging is the obvious gesture on a desktop and useless on a phone —
  // HTML5 drag events simply do not fire from a touchscreen. The arrows are
  // there for that, and for anyone driving the page from a keyboard.
  // ---------------------------------------------------------------------

  const reorderingAllowed = Boolean(onReorderPlayers) && players.length > 1;

  const moveColumn = (from, to) => {
    if (!reorderingAllowed) return;
    const reordered = moveItem(players, from, to);
    // Dropping a column back where it started is a normal way to change your
    // mind, and it should not cost a request.
    if (sameOrder(reordered, players)) return;

    // An edit box open over a cell is anchored to a column index that is about
    // to mean a different player.
    setEditingCell(null);
    onReorderPlayers(reordered.map((player) => player.player_id));
  };

  const handleDragStart = (seat) => (event) => {
    setDraggingSeat(seat);
    // Firefox ignores a drag that carries nothing at all.
    event.dataTransfer.setData('text/plain', String(seat));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (seat) => (event) => {
    if (draggingSeat === null) return;
    // Without this the browser treats the header as an invalid target and
    // never fires a drop.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetSeat(seat);
  };

  const handleDrop = (seat) => (event) => {
    event.preventDefault();
    if (draggingSeat !== null) moveColumn(draggingSeat, seat);
    setDraggingSeat(null);
    setDropTargetSeat(null);
  };

  // Fires whether the drag ended in a drop or was abandoned, so the highlight
  // cannot be left on after a drag that went nowhere.
  const handleDragEnd = () => {
    setDraggingSeat(null);
    setDropTargetSeat(null);
  };

  const headerClasses = (seat) => {
    const classes = ['player-header'];
    if (reorderingAllowed) classes.push('draggable');
    if (draggingSeat === seat) classes.push('dragging');
    if (dropTargetSeat === seat && draggingSeat !== seat) classes.push('drop-target');
    return classes.join(' ');
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

  /**
   * What a cell is, as class names.
   *
   * This used to be a style object built from the settings file, which meant
   * the matrix palette lived in JavaScript while the rest of the app's lived in
   * CSS, and the two disagreed. The colours are now custom properties that the
   * settings file feeds (see utils/theme.js), so a cell only has to say what
   * kind of cell it is.
   */
  const cellClasses = (roundIdx, playerIdx, cell) => {
    const classes = ['matrix-cell'];

    if ((roundIdx % players.length) === playerIdx) classes.push('priority');

    if ((roundIdx + 1) > game.current_round) {
      classes.push('future');
    } else if (cell.bet !== null) {
      if (cell.success) classes.push('success');
      else if (cell.score !== null) classes.push('failed');
      else classes.push('pending');
    }

    return classes.join(' ');
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
          <p className="text-bad">Loading players...</p>
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
        {mode === 'results' && game.current_round === game.total_rounds && onFinishGame ? (
          <button onClick={onFinishGame} className="matrix-action primary">
            🏁 FINISH
          </button>
        ) : mode === 'results' && game.current_round < game.total_rounds ? (
          <button onClick={handleNextRound} className="matrix-action primary">
            ⏭️ NEXT ROUND
          </button>
        ) : null}
        {/* Which way round the marking works follows the starting state, so
            the instruction names the shorter list rather than both. */}
        <div className="mode-indicator">
          {mode === 'bets'
            ? 'Bet Entry'
            : defaultSuccess()
              ? 'Double-click anyone who went down'
              : 'Double-click anyone who made it'}
        </div>
      </div>

      <div className="matrix-wrapper">
        <table className="game-matrix">
          <thead>
            <tr>
              <th>Round</th>
              {players.map((player, seat) => (
                <th
                  key={player.player_id}
                  className={headerClasses(seat)}
                  draggable={reorderingAllowed}
                  onDragStart={handleDragStart(seat)}
                  onDragOver={handleDragOver(seat)}
                  onDrop={handleDrop(seat)}
                  onDragEnd={handleDragEnd}
                  title={reorderingAllowed ? 'Drag to reorder, or use the arrows' : undefined}
                >
                  <span className="player-name">{player.player_alias}</span>

                  {reorderingAllowed && (
                    <span className="seat-controls">
                      <button
                        type="button"
                        onClick={() => moveColumn(seat, seat - 1)}
                        disabled={seat === 0}
                        aria-label={`Move ${player.player_alias} left`}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => moveColumn(seat, seat + 1)}
                        disabled={seat === players.length - 1}
                        aria-label={`Move ${player.player_alias} right`}
                      >
                        ▶
                      </button>
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, roundIdx) => (
              <tr key={roundIdx}>
                <td
                  className={
                    (roundIdx + 1) === game.current_round
                      ? 'round-label current'
                      : 'round-label'
                  }
                >
                  {roundIdx + 1}
                </td>
                {row.map((cell, playerIdx) => {
                  const isEditing = editingCell?.round === roundIdx && editingCell?.player === playerIdx;

                  return (
                    <td
                      key={playerIdx}
                      className={cellClasses(roundIdx, playerIdx, cell)}
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
