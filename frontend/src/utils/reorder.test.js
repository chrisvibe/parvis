import { moveItem, sameOrder } from './reorder';

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];

  test('moves an item to the left', () => {
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
  });

  test('moves an item to the right', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  test('a move to the right lands where it was dropped, not one short', () => {
    // Removing first shortens the list, so the naive version puts the item one
    // place left of where it was aimed. Moving to the last index is where that
    // shows up plainly.
    expect(moveItem(list, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  test('a neighbour swap is symmetric', () => {
    expect(moveItem(list, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveItem(list, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  test('leaves the original list alone', () => {
    moveItem(list, 0, 3);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  test('a move to the same place changes nothing', () => {
    expect(moveItem(list, 2, 2)).toEqual(list);
  });

  test('falling off either end changes nothing', () => {
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 3, 4)).toEqual(list);
  });
});

describe('sameOrder', () => {
  test('same items in the same order', () => {
    expect(sameOrder([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  test('same items in a different order', () => {
    expect(sameOrder([1, 2, 3], [1, 3, 2])).toBe(false);
  });

  test('different lengths', () => {
    expect(sameOrder([1, 2], [1, 2, 3])).toBe(false);
  });
});
