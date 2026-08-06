import React, { useState, useRef, useEffect } from 'react';
import { gamesApi } from '../api';
import { defaultSuccess, betIsAllowed } from '../utils/gameRules';
import { moveItem, sameOrder } from '../utils/reorder';
import { nextCell, sameCell } from '../utils/gridNavigation';
import '../styles/GameMatrix.css';

// Arrow keys, as directions the navigator understands.
const ARROWS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function GameMatrix({
  game,
  players,
  rounds,
  onRoundsUpdate,
  onReload,
  onFinishGame,
  onReorderPlayers,
  onEvictPlayer,
}) {
  const [mode, setMode] = useState('bets');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  // Where the keyboard is. Separate from the editor: in MARK RESULTS there is
  // no editor at all, but there is still a cell that Enter acts on.
  const [focusedCell, setFocusedCell] = useState(null);
  // Which column is being dragged. Held here rather than read back out of the
  // drag event because Firefox will not let you read dataTransfer during
  // dragover, which is exactly when the drop target needs to know.
  const [draggingSeat, setDraggingSeat] = useState(null);
  const [dropTargetSeat, setDropTargetSeat] = useState(null);

  // The rendered cells, so focus can be put on one. A map rather than an array
  // of refs because the board changes shape — rounds are added and removed, and
  // so are players — and stale entries clean themselves up as cells unmount.
  const cellRefs = useRef(new Map());

  // A synchronous shadow of editingCell.
  //
  // The input's blur handler needs to know whether the editor is still on the
  // cell it was rendered for, and it cannot ask React: the handler closes over
  // the render that put the input there, where the answer is always yes. When a
  // keystroke commits a cell and moves on, the blur that follows would then
  // commit it a second time — the second one carrying whatever the value had
  // become. A ref is updated the moment the editor moves, so blur can tell the
  // difference between "you were interrupted" and "you already saved this".
  const editingRef = useRef(null);

  const setEditing = (cell) => {
    editingRef.current = cell;
    setEditingCell(cell);
  };

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

  // How far the keyboard may go. Rounds nobody has reached yet are drawn dimmed
  // and take no clicks, so they take no cursor either.
  const bounds = React.useMemo(
    () => ({
      rounds: Math.min(game.current_round, matrix.length),
      players: players.length,
    }),
    [game.current_round, matrix.length, players.length]
  );

  // Calculate totals
  const totals = React.useMemo(() => {
    return players.map(player => {
      const playerRounds = rounds.filter(r => r.player_id === player.player_id);
      return playerRounds.reduce((sum, r) => sum + (r.score || 0), 0);
    });
  }, [rounds, players]);

  // Focus follows the cursor. Not while the editor is up — the input inside the
  // cell has the focus then, and pulling it out to the cell would end the edit
  // on every keystroke that moved the cursor.
  useEffect(() => {
    if (!focusedCell || editingCell) return;
    cellRefs.current.get(`${focusedCell.round}:${focusedCell.player}`)?.focus();
  }, [focusedCell, editingCell]);

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

    // Switch back to edit bets mode, standing on the first bid of the round
    // that just opened — the next thing anyone does is type it.
    setEditing(null);
    setMode('bets');
    setFocusedCell({ round: newRound - 1, player: 0 });
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
    // to mean a different player. So is the cursor.
    setEditing(null);
    setFocusedCell(null);
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

  // Only offered while there is somebody to take out and a game left over
  // afterwards. Cards need two, and the server refuses the last cut anyway.
  const evictionAllowed = Boolean(onEvictPlayer) && players.length > 2;

  const headerClasses = (seat) => {
    const classes = ['player-header'];
    if (reorderingAllowed) classes.push('draggable');
    if (draggingSeat === seat) classes.push('dragging');
    if (dropTargetSeat === seat && draggingSeat !== seat) classes.push('drop-target');
    return classes.join(' ');
  };

  // ---------------------------------------------------------------------
  // Entering a round
  //
  // People are sat round a table waiting while this gets typed in, so it works
  // the way a spreadsheet works: arrows move, Tab goes on, typing a digit
  // overwrites. Enter is the one key that means different things in the two
  // modes, because the two modes are different jobs — bets are written, results
  // are flipped — and it should do the obvious thing in each.
  // ---------------------------------------------------------------------

  const switchMode = (next) => {
    // An open editor belongs to bet entry. Leaving it standing over a cell in
    // MARK RESULTS would put a text box where typing no longer means anything.
    setEditing(null);
    setMode(next);
  };

  const moveFocus = (from, direction) => {
    const target = nextCell(from, direction, bounds);
    if (target) setFocusedCell(target);
    return target;
  };

  // A round nobody has reached is dimmed and takes no clicks. The keyboard has
  // to be told the same thing, or Enter on a cell the mouse cannot touch would
  // open an editor over it.
  const playable = (roundIdx, playerIdx) =>
    roundIdx >= 0 && roundIdx < bounds.rounds &&
    playerIdx >= 0 && playerIdx < bounds.players;

  const openEditor = (roundIdx, playerIdx, seed = null) => {
    if (!playable(roundIdx, playerIdx)) return;
    const cell = matrix[roundIdx][playerIdx];
    setFocusedCell({ round: roundIdx, player: playerIdx });
    setEditing({ round: roundIdx, player: playerIdx });
    // A seed is the digit that opened the editor, and it replaces what was
    // there — that is what typing over a spreadsheet cell does. A digit too big
    // for the round opens an empty box instead of one holding a bet nobody
    // could make.
    if (seed !== null) {
      setEditValue(betIsAllowed(seed, roundIdx + 1) ? seed : '');
    } else {
      setEditValue(cell.bet !== null ? String(cell.bet) : '');
    }
  };

  const toggleSuccess = (roundIdx, playerIdx) => {
    if (!playable(roundIdx, playerIdx)) return;
    const cell = matrix[roundIdx][playerIdx];
    // Nothing was bid, so there is no outcome to flip yet.
    if (cell.bet === null) return;
    updateCell(roundIdx, playerIdx, cell.bet, !cell.success);
  };

  const handleCellClick = (roundIdx, playerIdx) => {
    if (mode === 'bets') {
      openEditor(roundIdx, playerIdx);
    } else {
      // No editor in this mode, but the cell still becomes the one the
      // keyboard is on, so a click can be followed by Enter.
      setFocusedCell({ round: roundIdx, player: playerIdx });
    }
  };

  const handleCellDoubleClick = (roundIdx, playerIdx) => {
    if (mode === 'results') toggleSuccess(roundIdx, playerIdx);
  };

  const handleCellKeyDown = (roundIdx, playerIdx) => (event) => {
    const { key } = event;
    const here = { round: roundIdx, player: playerIdx };

    if (key === 'Tab') {
      const target = nextCell(here, event.shiftKey ? 'previous' : 'next', bounds);
      // Past the last cell there is nowhere left inside the table. Letting the
      // browser have this one is what stops the grid being a trap for anyone
      // driving the page from the keyboard.
      if (!target) return;
      event.preventDefault();
      setFocusedCell(target);
      return;
    }

    // Browser and system shortcuts go on working; only bare keys drive the grid.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (ARROWS[key]) {
      // Otherwise the page scrolls out from under the cursor as it moves.
      event.preventDefault();
      moveFocus(here, ARROWS[key]);
      return;
    }

    if (mode === 'bets') {
      if (key === 'Enter') {
        event.preventDefault();
        openEditor(roundIdx, playerIdx);
      } else if (/^\d$/.test(key)) {
        // Straight into the editor carrying the digit, so a bid is one
        // keystroke rather than a click and then a keystroke.
        event.preventDefault();
        openEditor(roundIdx, playerIdx, key);
      }
      return;
    }

    // MARK RESULTS: Enter flips the cell it is standing on. Space too, since
    // that is what every other toggle on a page answers to.
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      toggleSuccess(roundIdx, playerIdx);
    }
  };

  const handleCellFocus = (roundIdx, playerIdx) => () => {
    const here = { round: roundIdx, player: playerIdx };
    // Focus can arrive without going through this component — a Tab from the
    // nav lands on the grid's tab stop. Catching it here means the highlight
    // and the arrow keys agree with where the browser actually is.
    if (!sameCell(focusedCell, here)) setFocusedCell(here);
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
    if (betIsAllowed(e.target.value, editingCell.round + 1)) {
      setEditValue(e.target.value);
    }
  };

  /**
   * Save what is in the box.
   *
   * An empty box is a bet of zero rather than nothing: every player has a row
   * in every round they played, and leaving one absent would make the round
   * look unfinished when in fact somebody passed.
   */
  const commit = (cell) => {
    const bet = editValue === '' ? 0 : parseInt(editValue, 10);
    return updateCell(cell.round, cell.player, bet, matrix[cell.round][cell.player].success);
  };

  const handleInputBlur = (roundIdx, playerIdx) => {
    // A blur that arrives after the keyboard already moved the editor on has
    // nothing to save — that keystroke committed this cell before it left. See
    // editingRef above for why this cannot be asked of state.
    if (!sameCell(editingRef.current, { round: roundIdx, player: playerIdx })) return;
    const cell = editingRef.current;
    setEditing(null);
    commit(cell);
  };

  const handleInputKeyDown = (event) => {
    // Keys typed into the editor are not also keys typed at the cell behind it.
    // Without this every digit would reach the cell's handler and reopen the
    // editor on itself.
    event.stopPropagation();

    const { key } = event;
    const from = editingRef.current;
    if (!from) return;

    if (key === 'Escape') {
      // Abandon the edit. The effect above puts focus back on the cell, so the
      // arrows keep working from where the box was.
      event.preventDefault();
      setEditing(null);
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const direction =
      key === 'Enter' ? 'next'
      : key === 'Tab' ? (event.shiftKey ? 'previous' : 'next')
      : ARROWS[key] ?? null;

    if (!direction) return;
    event.preventDefault();

    const target = nextCell(from, direction, bounds);

    // The move happens before the save, not after it. A round of bidding is
    // typed at the speed people say the numbers, and waiting for the server
    // between each one would put the box behind the person talking.
    if (target && (direction === 'next' || direction === 'previous')) {
      // Tab and Enter carry on entering: the editor lands open on the next
      // cell, so a whole round is digits and Enters with nothing in between.
      const nextBet = matrix[target.round][target.player].bet;
      setFocusedCell(target);
      setEditing(target);
      setEditValue(nextBet !== null ? String(nextBet) : '');
    } else {
      // An arrow is a move rather than a continuation, and at an edge it is not
      // even that — either way the box closes and the cell keeps the cursor.
      setEditing(null);
      if (target) setFocusedCell(target);
    }

    commit(from);
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

    if (sameCell(focusedCell, { round: roundIdx, player: playerIdx })) {
      classes.push('focused');
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

  // Which cell Tab reaches the grid on. One cell in the table is reachable and
  // the rest are not, so tabbing through the page steps over the matrix rather
  // than through every square of it; the arrows do the moving once inside.
  const tabStop = focusedCell ?? { round: 0, player: 0 };

  return (
    <div className="game-matrix-container">
      <div className="matrix-controls">
        <button
          onClick={() => switchMode('bets')}
          className={mode === 'bets' ? 'active' : ''}
        >
          📝 EDIT BETS
        </button>
        <button
          onClick={() => switchMode('results')}
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
            ? 'Bet Entry — type, Enter for the next'
            : defaultSuccess()
              ? 'Enter or double-click anyone who went down'
              : 'Enter or double-click anyone who made it'}
        </div>
      </div>

      <div className="matrix-wrapper">
        {/*
          The columns are declared rather than measured. With table-layout:fixed
          the widths come from here and from nothing else, so a cell that grows
          from "-" to "10" no longer widens its column and shunts every other
          one sideways — which it did on every single bet that got typed in.
          The player columns carry no width, which under that algorithm means
          they split whatever is left equally and fill the screen.
        */}
        <table className="game-matrix" style={{ '--player-columns': players.length }}>
          <colgroup>
            <col className="round-col" />
            {players.map((player) => (
              <col key={player.player_id} />
            ))}
          </colgroup>
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
                  {/* A fixed column can be narrower than the name in it, so the
                      name is clipped and carries its own tooltip. */}
                  <span className="player-name" title={player.player_alias}>
                    {player.player_alias}
                  </span>

                  {(reorderingAllowed || evictionAllowed) && (
                    <span className="seat-controls">
                      {reorderingAllowed && (
                        <>
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
                        </>
                      )}

                      {evictionAllowed && (
                        <button
                          type="button"
                          className="seat-exit"
                          onClick={() => onEvictPlayer(player.player_id, player.player_alias)}
                          title={`Take ${player.player_alias} out of this game`}
                          aria-label={`Take ${player.player_alias} out of this game`}
                        >
                          🚪
                        </button>
                      )}
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
                  const isEditing = sameCell(editingCell, { round: roundIdx, player: playerIdx });

                  return (
                    <td
                      key={playerIdx}
                      ref={(node) => {
                        const at = `${roundIdx}:${playerIdx}`;
                        if (node) cellRefs.current.set(at, node);
                        else cellRefs.current.delete(at);
                      }}
                      className={cellClasses(roundIdx, playerIdx, cell)}
                      tabIndex={sameCell(tabStop, { round: roundIdx, player: playerIdx }) ? 0 : -1}
                      onClick={() => handleCellClick(roundIdx, playerIdx)}
                      onDoubleClick={() => handleCellDoubleClick(roundIdx, playerIdx)}
                      onKeyDown={handleCellKeyDown(roundIdx, playerIdx)}
                      onFocus={handleCellFocus(roundIdx, playerIdx)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={handleInputChange}
                          /* Selected on arrival, so the first digit typed
                             replaces the old bet instead of being appended to
                             it and rejected for being too big. */
                          onFocus={(event) => event.target.select()}
                          onBlur={() => handleInputBlur(roundIdx, playerIdx)}
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
