/**
 * Moving around the game matrix with the keyboard.
 *
 * Entering a round of bids is the one thing this app is doing while people are
 * sat around a table waiting, so it has to work the way a spreadsheet works:
 * arrows to move, tab to go on, type to overwrite. All of that reduces to "given
 * where I am and which way I went, where do I end up", which is worth having on
 * its own away from the component — the off-by-one at an edge is the whole bug
 * surface here, and it is invisible in a browser until somebody is mid-game.
 *
 * Two families of direction, and they differ at the edges:
 *
 *   up/down/left/right  stop at the wall, the way arrow keys do everywhere.
 *   next/previous       flow — off the end of a row is the start of the next,
 *                       and off the end of the table is `null`, meaning there is
 *                       nowhere left to go. The caller turns that into "let the
 *                       browser have this Tab", so the grid never traps anyone.
 */

const clamp = (value, limit) => Math.max(0, Math.min(value, limit - 1));

/**
 * @param cell   {round, player} — both zero-based indexes into the matrix
 * @param bounds {rounds, players} — how far the playable area extends. `rounds`
 *               is the current round, not the total: rounds nobody has reached
 *               are drawn dimmed and inert, and the keyboard should not walk
 *               into them either.
 * @returns the cell to move to, or null if there is none
 */
export const nextCell = (cell, direction, { rounds, players }) => {
  if (!cell || rounds < 1 || players < 1) return null;

  // The starting point is clamped rather than trusted. A game can lose rounds
  // (ADJUST ROUNDS) or a column (a player taken out of the game) while a cell
  // is focused, and a stale index would otherwise navigate from a place that is
  // no longer on the board.
  const round = clamp(cell.round, rounds);
  const player = clamp(cell.player, players);

  switch (direction) {
    case 'up':
      return { round: clamp(round - 1, rounds), player };
    case 'down':
      return { round: clamp(round + 1, rounds), player };
    case 'left':
      return { round, player: clamp(player - 1, players) };
    case 'right':
      return { round, player: clamp(player + 1, players) };

    case 'next':
      if (player + 1 < players) return { round, player: player + 1 };
      if (round + 1 < rounds) return { round: round + 1, player: 0 };
      return null;

    case 'previous':
      if (player > 0) return { round, player: player - 1 };
      if (round > 0) return { round: round - 1, player: players - 1 };
      return null;

    default:
      return null;
  }
};

/** Whether two cell references point at the same square. */
export const sameCell = (a, b) =>
  Boolean(a) && Boolean(b) && a.round === b.round && a.player === b.player;
