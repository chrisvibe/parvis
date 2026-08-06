import { nextCell, sameCell } from './gridNavigation';

// A four-round, three-player board, all four rounds in play.
const board = { rounds: 4, players: 3 };
const at = (round, player) => ({ round, player });

describe('arrow movement', () => {
  test('goes the way it was asked', () => {
    expect(nextCell(at(1, 1), 'up', board)).toEqual(at(0, 1));
    expect(nextCell(at(1, 1), 'down', board)).toEqual(at(2, 1));
    expect(nextCell(at(1, 1), 'left', board)).toEqual(at(1, 0));
    expect(nextCell(at(1, 1), 'right', board)).toEqual(at(1, 2));
  });

  test('stops at every wall rather than wrapping', () => {
    // Arrow keys stop at the edge everywhere else, and a wrap here would be a
    // silent jump to a different player or a different round mid-entry.
    expect(nextCell(at(0, 0), 'up', board)).toEqual(at(0, 0));
    expect(nextCell(at(0, 0), 'left', board)).toEqual(at(0, 0));
    expect(nextCell(at(3, 2), 'down', board)).toEqual(at(3, 2));
    expect(nextCell(at(3, 2), 'right', board)).toEqual(at(3, 2));
  });

  test('the wall is the current round, not the last one', () => {
    // Rounds nobody has reached are dimmed and unclickable. Walking into them
    // with the keyboard would put a cursor somewhere the mouse cannot go.
    expect(nextCell(at(1, 0), 'down', { rounds: 2, players: 3 })).toEqual(at(1, 0));
  });
});

describe('flowing on with tab', () => {
  test('moves along the row', () => {
    expect(nextCell(at(2, 0), 'next', board)).toEqual(at(2, 1));
    expect(nextCell(at(2, 2), 'previous', board)).toEqual(at(2, 1));
  });

  test('the end of a row is the start of the next', () => {
    // This is the whole point of entering bids by keyboard: the table bids in
    // seat order and then the round is over, so the last seat leads straight
    // into the next round's first.
    expect(nextCell(at(1, 2), 'next', board)).toEqual(at(2, 0));
    expect(nextCell(at(2, 0), 'previous', board)).toEqual(at(1, 2));
  });

  test('off the end of the table is nowhere', () => {
    // null, not a clamp: the caller lets the browser have that Tab, so the grid
    // can always be tabbed out of and never traps a keyboard.
    expect(nextCell(at(3, 2), 'next', board)).toBeNull();
    expect(nextCell(at(0, 0), 'previous', board)).toBeNull();
  });

  test('a single-player game still flows down the rounds', () => {
    expect(nextCell(at(0, 0), 'next', { rounds: 3, players: 1 })).toEqual(at(1, 0));
  });
});

describe('boards that changed under the cursor', () => {
  // ADJUST ROUNDS can shorten a game and a player can be evicted from one, both
  // while a cell is focused. Navigating from an index that no longer exists
  // should land somewhere real rather than off the board.
  test('a cell beyond the last round navigates from the last round', () => {
    expect(nextCell(at(9, 1), 'up', board)).toEqual(at(2, 1));
  });

  test('a cell beyond the last column navigates from the last column', () => {
    expect(nextCell(at(1, 9), 'left', board)).toEqual(at(1, 1));
  });

  test('an empty board has nowhere to go', () => {
    expect(nextCell(at(0, 0), 'right', { rounds: 0, players: 3 })).toBeNull();
    expect(nextCell(at(0, 0), 'right', { rounds: 4, players: 0 })).toBeNull();
  });

  test('coming from nowhere goes nowhere', () => {
    expect(nextCell(null, 'next', board)).toBeNull();
  });
});

test('a direction with no meaning moves nothing', () => {
  // Better a cursor that sits still than one that jumps somewhere arbitrary
  // because a key was mapped wrong.
  expect(nextCell(at(1, 1), 'sideways', board)).toBeNull();
});

describe('sameCell', () => {
  test('same square', () => {
    expect(sameCell(at(2, 1), at(2, 1))).toBe(true);
  });

  test('different squares', () => {
    expect(sameCell(at(2, 1), at(1, 2))).toBe(false);
  });

  test('nothing is not the same as anything, including nothing', () => {
    // It is used to answer "is the editor still on this cell", where a missing
    // editor has to read as no.
    expect(sameCell(null, at(0, 0))).toBe(false);
    expect(sameCell(at(0, 0), null)).toBe(false);
    expect(sameCell(null, null)).toBe(false);
  });
});
