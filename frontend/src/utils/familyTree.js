/**
 * Turning a family into something a tree renderer can draw.
 *
 * A family is not a tree. Two people have children together, so a child has two
 * parents, and a tree gives every node exactly one. The old version drew the
 * child once under each parent — the same person in two places, with no way to
 * tell it was the same person.
 *
 * The fix is to stop treating a *person* as the unit of layout and use a
 * UNION instead: the set of people who are parents together, drawn side by side
 * with their children hanging beneath the couple. Then
 *
 *     the layout-parent of a person is the union of their parents
 *
 * and every person has exactly one of those, whatever their parents did. What
 * was a graph is a tree again, and it is a tree by construction rather than by
 * hoping the data stays simple.
 *
 * Unions come from two places:
 *   - a declared partnership (`partner_ids`), which draws a couple even if they
 *     have no children
 *   - shared parenthood, which draws two people as a couple because they have a
 *     child together, whether or not anyone recorded them as partners. This is
 *     what makes existing data render correctly before a single partnership has
 *     been entered.
 *
 * THE CASE THAT CANNOT BE DRAWN
 * -----------------------------
 * A couple can only hang in one place, but both halves have parents of their
 * own. Whichever one is not chosen would lose their ancestry — so they are
 * drawn a second time, as a GHOST: a dashed outline under their own parents,
 * clicking through to the same player. Remarriage does the same thing (a person
 * in two unions renders fully in one and as a ghost in the other). Every
 * genealogy tool makes this trade; the alternative is duplicating whole
 * subtrees, which is far more confusing.
 */

// Union keys are built from member ids so that the same set of people always
// produces the same union, no matter which relationship implied it.
const unionKey = (memberIds) => [...memberIds].sort((a, b) => a - b).join(',');

const byBirthdate = (a, b) => {
  if (!a.birthdate && !b.birthdate) return 0;
  if (!a.birthdate) return 1;
  if (!b.birthdate) return -1;
  return new Date(a.birthdate) - new Date(b.birthdate);
};

const matchesSearch = (player, term) =>
  player.alias.toLowerCase().includes(term) ||
  (player.first_name && player.first_name.toLowerCase().includes(term)) ||
  (player.last_name && player.last_name.toLowerCase().includes(term));

/**
 * The ids worth drawing for a given search, or for the "recent players" view.
 *
 * Searching pulls in the whole family of every match — ancestors, descendants
 * and partners — because a match on its own tells you nothing about where the
 * person sits. The unsearched view shows the recent players plus their
 * partners, so a couple is never drawn as half a couple.
 */
const relevantIds = (players, playerMap, searchTerm, idsToShow) => {
  const partnersOf = (id) => playerMap.get(id)?.partner_ids || [];

  if (searchTerm) {
    const matched = players.filter((p) => matchesSearch(p, searchTerm));
    if (matched.length === 0) return new Set();

    const relevant = new Set();
    const visit = (id) => {
      if (relevant.has(id)) return;
      relevant.add(id);

      const player = playerMap.get(id);
      if (!player) return;

      (player.parent_ids || []).forEach(visit);
      (player.child_ids || []).forEach(visit);
      partnersOf(id).forEach(visit);
    };

    matched.forEach((p) => visit(p.id));
    return relevant;
  }

  if (idsToShow && idsToShow.size > 0) {
    const relevant = new Set(idsToShow);
    idsToShow.forEach((id) => partnersOf(id).forEach((partnerId) => {
      if (playerMap.has(partnerId)) relevant.add(partnerId);
    }));
    return relevant;
  }

  return new Set(players.map((p) => p.id));
};

/**
 * Group the visible players into unions.
 *
 * @returns {Map} union key to { key, memberIds, childIds, isDeclared }
 */
const buildUnions = (visible, playerMap) => {
  const unions = new Map();

  const ensure = (memberIds, isDeclared) => {
    const key = unionKey(memberIds);
    if (!unions.has(key)) {
      unions.set(key, {
        key,
        memberIds: [...memberIds].sort((a, b) => a - b),
        childIds: [],
        // A couple who are recorded as partners, rather than two people we
        // inferred were a couple because they share a child. Drawn differently
        // so the tree does not assert a relationship nobody entered.
        isDeclared: false,
      });
    }
    if (isDeclared) unions.get(key).isDeclared = true;
    return unions.get(key);
  };

  // Unions implied by parenthood. The parent set is filtered to visible
  // players, so a hidden parent does not create a union with a gap in it.
  visible.forEach((player) => {
    const parents = (player.parent_ids || []).filter((id) => playerMap.has(id));
    if (parents.length > 0) ensure(parents, false).childIds.push(player.id);
  });

  // Unions declared as partnerships, whether or not they have children.
  visible.forEach((player) => {
    (player.partner_ids || [])
      .filter((id) => playerMap.has(id))
      .forEach((partnerId) => ensure([player.id, partnerId], true));
  });

  // Anyone left over stands alone. A union of one is still a union, which is
  // what keeps the rest of this file free of special cases.
  const claimed = new Set();
  unions.forEach((union) => union.memberIds.forEach((id) => claimed.add(id)));
  visible.forEach((player) => {
    if (!claimed.has(player.id)) ensure([player.id], false);
  });

  unions.forEach((union) => {
    union.childIds.sort((a, b) => byBirthdate(playerMap.get(a), playerMap.get(b)));
  });

  return unions;
};

/**
 * Decide, for each person, which union draws them for real.
 *
 * Someone with two partnerships belongs to two unions and can only be drawn
 * properly in one. The one with more children wins — that is the branch with
 * more hanging off it, and the one a reader is more likely to be following.
 */
const chooseHomeUnions = (unions) => {
  const home = new Map();

  const score = (union) => union.childIds.length;

  unions.forEach((union) => {
    union.memberIds.forEach((id) => {
      const current = home.get(id);
      if (!current) {
        home.set(id, union);
        return;
      }
      if (score(union) > score(current)) home.set(id, union);
    });
  });

  return home;
};

/**
 * The member whose parents decide where a union hangs.
 *
 * Preference goes to a member this union actually draws (its home union) and
 * who has visible parents. A union nobody can anchor is a root.
 */
const chooseAnchors = (unions, playerMap, homeUnions) => {
  const anchors = new Map();

  unions.forEach((union) => {
    const candidates = union.memberIds.filter((id) => {
      const player = playerMap.get(id);
      const parents = (player?.parent_ids || []).filter((pid) => playerMap.has(pid));
      return parents.length > 0 && homeUnions.get(id) === union;
    });

    if (candidates.length > 0) anchors.set(union.key, candidates[0]);
  });

  return anchors;
};

const personAttributes = (player, { isGhost = false } = {}) => ({
  id: player.id,
  alias: player.alias,
  firstName: player.first_name || '',
  middleName: player.middle_name || '',
  lastName: player.last_name || '',
  birthdate: player.birthdate || '',
  // Matches played, not age: what people want to know on hover is how much
  // someone has played, and age is already implied by where they sit.
  matches: player.games_played ?? 0,
  isGhost,
});

/**
 * Build the union forest and convert it straight to react-d3-tree's format.
 *
 * @param {Array} players - all players, each with parent_ids/child_ids/partner_ids
 * @param {string} searchTerm - optional search filter
 * @param {Set} idsToShow - ids to show when not searching
 * @returns {Array} root nodes
 */
export const buildFamilyTree = (players, searchTerm = '', idsToShow = null) => {
  if (!players || players.length === 0) return [];

  const term = searchTerm.trim().toLowerCase();
  const allById = new Map(players.map((p) => [p.id, p]));

  const visibleIds = relevantIds(players, allById, term, idsToShow);
  if (visibleIds.size === 0) return [];

  const playerMap = new Map(
    players.filter((p) => visibleIds.has(p.id)).map((p) => [p.id, p])
  );
  const visible = [...playerMap.values()];

  const unions = buildUnions(visible, playerMap);
  const homeUnions = chooseHomeUnions(unions);
  const anchors = chooseAnchors(unions, playerMap, homeUnions);

  // Where each union hangs: under the union formed by its anchor's parents.
  const childUnionsByParentKey = new Map();
  const rootUnions = [];

  unions.forEach((union) => {
    const anchorId = anchors.get(union.key);
    if (anchorId === undefined) {
      rootUnions.push(union);
      return;
    }

    const parentKey = unionKey(
      (playerMap.get(anchorId).parent_ids || []).filter((id) => playerMap.has(id))
    );

    if (!childUnionsByParentKey.has(parentKey)) childUnionsByParentKey.set(parentKey, []);
    childUnionsByParentKey.get(parentKey).push(union);
  });

  // Which unions have been drawn, across all roots. A union hangs from at most
  // one place, so this is a record rather than a guard — except after a cycle,
  // where it is what stops the same ring being drawn from every angle.
  const emitted = new Set();

  const toNode = (union, seen) => {
    // A loop in the stored data would otherwise recurse until the tab dies. The
    // server refuses to create one, but a database that already contains one
    // still has to render.
    if (seen.has(union.key)) return null;
    const nextSeen = new Set(seen).add(union.key);
    emitted.add(union.key);

    const members = union.memberIds
      .map((id) => playerMap.get(id))
      .filter(Boolean)
      .sort(byBirthdate)
      .map((player) => personAttributes(player, {
        isGhost: homeUnions.get(player.id) !== union,
      }));

    const anchorId = anchors.get(union.key);

    // Children of this union: each child's own union if that child anchors it,
    // otherwise a ghost, because the real one is drawn under their partner's
    // parents instead.
    const childNodes = [];
    union.childIds.forEach((childId) => {
      const home = homeUnions.get(childId);
      if (home && anchors.get(home.key) === childId) return; // added below
      childNodes.push({
        name: playerMap.get(childId).alias,
        attributes: {
          kind: 'ghost',
          members: [personAttributes(playerMap.get(childId), { isGhost: true })],
          unionKey: `ghost:${union.key}:${childId}`,
        },
        children: [],
      });
    });

    (childUnionsByParentKey.get(union.key) || []).forEach((childUnion) => {
      const node = toNode(childUnion, nextSeen);
      if (node) childNodes.push(node);
    });

    return {
      // react-d3-tree keys off `name`; the members carry what is actually drawn.
      name: members.map((m) => m.alias).join(' & '),
      attributes: {
        kind: 'union',
        unionKey: union.key,
        members,
        isDeclared: union.isDeclared,
        anchorId: anchorId ?? null,
      },
      children: childNodes,
    };
  };

  const roots = rootUnions.map((union) => toNode(union, new Set())).filter(Boolean);

  // Every union in a cycle hangs from another union in the same cycle, so the
  // ring has no root and nothing above would ever reach it. Left at that, one
  // bad pair of edges hides the entire family. Anything still undrawn is
  // promoted to a root instead; the loop guard above keeps it finite.
  unions.forEach((union) => {
    if (emitted.has(union.key)) return;
    const node = toNode(union, new Set());
    if (node) roots.push(node);
  });

  return roots.sort((a, b) => byBirthdate(
    playerMap.get(a.attributes.members[0].id),
    playerMap.get(b.attributes.members[0].id)
  ));
};

/**
 * Wrap a forest under an invisible root, which is what react-d3-tree needs to
 * draw more than one family at once.
 */
export const convertToD3TreeFormat = (familyTree) => {
  if (!familyTree || familyTree.length === 0) {
    return { name: 'No players', attributes: { kind: 'empty', members: [] }, children: [] };
  }

  if (familyTree.length === 1) return familyTree[0];

  return {
    name: '',
    attributes: { kind: 'invisible', members: [] },
    children: familyTree,
  };
};

// Courier New advances 0.6em per glyph, and every glyph the same — which is the
// only reason a label can be measured with arithmetic instead of a hidden DOM
// node and a reflow.
const MONOSPACE_ADVANCE = 0.6;

// Text sits on one line through the middle of the circle, so the full diameter
// is available in principle; leave a margin so glyphs do not touch the stroke.
const USABLE_DIAMETER_FRACTION = 0.85;

const DEFAULT_MAX_FONT_SIZE = 12;
// 8px is small but still legible, and it is what lets a seven-letter name like
// "camilla" sit whole inside a radius-20 circle. At the old floor of 9 it
// missed by half a character and got cut to "camil…", which is the worst of
// both worlds: no shorter to read, and no longer the name.
const DEFAULT_MIN_FONT_SIZE = 8;

/**
 * The abbreviations to try when the alias will not fit, best first.
 *
 * Never a mid-word cut. "camil…" reads as a word that got truncated, which
 * makes the reader wonder what was lost; "CA" reads as an abbreviation, which
 * tells them to look at the tooltip. Same information, less doubt.
 *
 * @param {string} label - the alias
 * @param {Array} nameParts - [first, middle, last], any of them blank
 */
const abbreviations = (label, nameParts) => {
  const candidates = [];

  // Initials of the real name: "Camilla Andersen" becomes "CA".
  const named = (nameParts || []).map((part) => (part || '').trim()).filter(Boolean);
  if (named.length > 1) {
    candidates.push(named.map((part) => part[0].toUpperCase()).join(''));
  }

  // Initials of an alias that is itself several words: "john-cleave-doe"
  // becomes "JCD". Split on the separators people actually use in names.
  const words = label.split(/[\s._-]+/).filter(Boolean);
  if (words.length > 1) {
    candidates.push(words.map((word) => word[0].toUpperCase()).join(''));
  }

  // A one-word alias with no name recorded has no initials at all, so take its
  // opening letters instead: "camilla" becomes "CA".
  candidates.push(label.slice(0, 2).toUpperCase());

  return candidates;
};

/**
 * Choose what to write inside a node and how big to write it.
 *
 * Preference order, stopping at the first thing that fits:
 *   1. the alias itself, as large as possible
 *   2. the alias shrunk, down to a floor where it is still readable — a name
 *      that fits at all is always clearer than an abbreviation of it
 *   3. an abbreviation, per `abbreviations` above
 *
 * The full alias and name are always in the node's <title>, so nothing is lost
 * by abbreviating here.
 *
 * @param {string} name - the alias to display
 * @param {number} radius - node radius in px
 * @param {Object} options - { nameParts, maxFontSize, minFontSize }
 * @returns {{ text: string, fontSize: number }}
 */
export const fitNodeLabel = (name, radius, options = {}) => {
  const maxFontSize = options.maxFontSize ?? DEFAULT_MAX_FONT_SIZE;
  const minFontSize = options.minFontSize ?? DEFAULT_MIN_FONT_SIZE;

  const label = (name || '').trim();
  if (!label) return { text: '', fontSize: maxFontSize };

  const usableWidth = 2 * radius * USABLE_DIAMETER_FRACTION;
  const fits = (text, size) => text.length * size * MONOSPACE_ADVANCE <= usableWidth;

  // Largest size in the allowed range at which `text` fits, or null.
  const bestSizeFor = (text) => {
    for (let size = maxFontSize; size >= minFontSize; size -= 0.5) {
      if (fits(text, size)) return size;
    }
    return null;
  };

  const fullSize = bestSizeFor(label);
  if (fullSize !== null) return { text: label, fontSize: fullSize };

  for (const candidate of abbreviations(label, options.nameParts)) {
    const size = bestSizeFor(candidate);
    if (size !== null) return { text: candidate, fontSize: size };
  }

  // A circle too small for even two characters. Show the one that fits rather
  // than overflowing the node.
  return { text: label.slice(0, 1).toUpperCase(), fontSize: minFontSize };
};

/**
 * Get recent players (sorted by last game date, then registration date)
 */
export const getRecentPlayers = (players, limit = 20) => {
  return [...players]
    .sort((a, b) => {
      const aDate = a.last_game_date ? new Date(a.last_game_date) : new Date(a.registration_date);
      const bDate = b.last_game_date ? new Date(b.last_game_date) : new Date(b.registration_date);
      return bDate - aDate;
    })
    .slice(0, limit);
};
