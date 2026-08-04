/**
 * Moving one item within a list.
 *
 * Both the drag handler and the arrow buttons need exactly this, and getting it
 * subtly wrong — off by one when moving right, because the removal shifts every
 * later index down — is the classic way a reorder feature ends up almost
 * working. Splicing out first and then inserting into the shortened list gets
 * it right in both directions without a special case.
 */
export const moveItem = (list, from, to) => {
  const items = [...list];

  // Out-of-range indexes come from the ends of the list: the leftmost column's
  // ◀ and the rightmost column's ▶. Returning the list unchanged means those
  // buttons can simply be disabled for looks rather than guarded for safety.
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }

  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  return items;
};

/**
 * Whether two lists name the same players in the same order.
 *
 * Used to decide if a reorder is worth a request. A drag that ends where it
 * started is a common way to change your mind, and it should cost nothing.
 */
export const sameOrder = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);
