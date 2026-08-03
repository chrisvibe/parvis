/**
 * Build hierarchical tree structure from flat player list
 * Players are sorted by age (oldest first) within each generation
 * @param {Array} players - All players (needed for building complete relationships)
 * @param {string} searchTerm - Optional search filter
 * @param {Set} idsToShow - Set of player IDs to show (when not searching)
 */

export const buildFamilyTree = (players, searchTerm = '', idsToShow = null) => {
  if (!players || players.length === 0) return [];
  
  // Create lookup map with ALL players (so relationships work)
  const playerMap = new Map();
  players.forEach(p => playerMap.set(p.id, { ...p, children: [] }));
  
  // Build parent-child relationships
  players.forEach(player => {
    const node = playerMap.get(player.id);
    if (player.parent_ids && player.parent_ids.length > 0) {
      player.parent_ids.forEach(parentId => {
        const parent = playerMap.get(parentId);
        if (parent && !parent.children.find(c => c.id === player.id)) {
          parent.children.push(node);
        }
      });
    }
  });
  
  // Sort children by age (oldest first)
  playerMap.forEach(node => {
    node.children.sort((a, b) => {
      if (!a.birthdate && !b.birthdate) return 0;
      if (!a.birthdate) return 1;
      if (!b.birthdate) return -1;
      return new Date(a.birthdate) - new Date(b.birthdate);
    });
  });
  
  // Find root nodes (no parents) - from ALL players
  const allRoots = Array.from(playerMap.values()).filter(p => 
    !p.parent_ids || p.parent_ids.length === 0
  );
  
  // Sort roots by age
  allRoots.sort((a, b) => {
    if (!a.birthdate && !b.birthdate) return 0;
    if (!a.birthdate) return 1;
    if (!b.birthdate) return -1;
    return new Date(a.birthdate) - new Date(b.birthdate);
  });
  
  // If searching, show matching nodes and their families
  if (searchTerm) {
    const filteredPlayers = players.filter(p => 
      p.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.first_name && p.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.last_name && p.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    if (filteredPlayers.length === 0) return [];
    
    const matchingIds = new Set(filteredPlayers.map(p => p.id));
    const relevantIds = new Set();
    
    // Add all ancestors and descendants of matching nodes
    const addAncestorsAndDescendants = (nodeId) => {
      if (relevantIds.has(nodeId)) return;
      relevantIds.add(nodeId);
      
      const node = playerMap.get(nodeId);
      if (!node) return;
      
      // Add parents (ancestors)
      if (node.parent_ids) {
        node.parent_ids.forEach(pid => addAncestorsAndDescendants(pid));
      }
      
      // Add children (descendants)
      node.children.forEach(child => addAncestorsAndDescendants(child.id));
    };
    
    matchingIds.forEach(id => addAncestorsAndDescendants(id));
    
    // Filter tree to only relevant nodes. Same loop guard as the D3 converter:
    // a cycle in the data would otherwise recurse forever here too.
    const filterTree = (nodes, ancestors = new Set()) => {
      return nodes
        .filter(node => relevantIds.has(node.id) && !ancestors.has(node.id))
        .map(node => ({
          ...node,
          children: filterTree(node.children, new Set(ancestors).add(node.id))
        }));
    };

    return filterTree(allRoots);
  }
  
  // If idsToShow provided (no search), filter roots to only recent players
  // This shows a "forest" of disconnected trees for recent players
  if (idsToShow && idsToShow.size > 0) {
    return allRoots.filter(root => idsToShow.has(root.id));
  }
  
  return allRoots;
};

/**
 * Convert family tree to react-d3-tree format
 * If multiple roots (forest), wraps them under an invisible root
 */
export const convertToD3TreeFormat = (familyTree) => {
  // `ancestors` holds the ids on the path from the root down to this node. If a
  // node turns up inside its own ancestry the data contains a loop (A parent of
  // B, B parent of A), and recursing further never terminates — which used to
  // take the whole page down with it. The server now refuses to store such a
  // pair, but a database that already contains one must still render, so stop
  // descending at the repeat and mark it instead.
  const convert = (node, ancestors = new Set()) => {
    const looping = ancestors.has(node.id);
    const nextAncestors = new Set(ancestors).add(node.id);

    return {
      name: node.alias,
      attributes: {
        id: node.id,
        firstName: node.first_name || '',
        middleName: node.middle_name || '',
        lastName: node.last_name || '',
        birthdate: node.birthdate || '',
        age: node.birthdate ? calculateAge(node.birthdate) : null,
        ...(looping ? { isLoop: true } : {})
      },
      children: looping ? [] : node.children.map(child => convert(child, nextAncestors))
    };
  };

  const converted = familyTree.map(node => convert(node));
  
  // If multiple roots (forest), wrap in an invisible parent
  if (converted.length > 1) {
    return {
      name: '',  // Empty name - invisible node
      attributes: { id: -1, isInvisible: true },
      children: converted
    };
  }
  
  // Single tree or no trees
  return converted.length > 0 ? converted[0] : { name: 'No players', attributes: { id: -1 }, children: [] };
};

// Courier New advances 0.6em per glyph, and every glyph the same — which is the
// only reason a label can be measured with arithmetic instead of a hidden DOM
// node and a reflow.
const MONOSPACE_ADVANCE = 0.6;

// Text sits on one line through the middle of the circle, so the full diameter
// is available in principle; leave a margin so glyphs do not touch the stroke.
const USABLE_DIAMETER_FRACTION = 0.85;

const DEFAULT_MAX_FONT_SIZE = 12;
const DEFAULT_MIN_FONT_SIZE = 9;

/**
 * Choose what to write inside a node and how big to write it.
 *
 * Preference order, stopping at the first thing that fits:
 *   1. the alias itself, as large as possible
 *   2. the alias shrunk, down to a floor where it is still readable
 *   3. initials — "John Cleave Doe" becomes "JCD"
 *   4. a truncated form with an ellipsis, for a single long word that has no
 *      initials to fall back on ("Bartholomew" cannot become anything shorter
 *      and still be itself)
 *
 * The full alias is always in the node's <title>, so nothing is lost by
 * abbreviating here.
 *
 * @param {string} name - the alias to display
 * @param {number} radius - node radius in px
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

  // Split on the separators people actually use in names.
  const words = label.split(/[\s._-]+/).filter(Boolean);
  if (words.length > 1) {
    const initials = words.map(w => w[0].toUpperCase()).join('');
    const initialsSize = bestSizeFor(initials);
    if (initialsSize !== null) return { text: initials, fontSize: initialsSize };
    return { text: truncate(initials, usableWidth, minFontSize), fontSize: minFontSize };
  }

  return { text: truncate(label, usableWidth, minFontSize), fontSize: minFontSize };
};

/** Cut `text` to what fits at `size`, marking the cut with an ellipsis. */
const truncate = (text, usableWidth, size) => {
  const maxChars = Math.floor(usableWidth / (size * MONOSPACE_ADVANCE));
  if (maxChars <= 1) return text.slice(0, 1);
  return text.slice(0, maxChars - 1) + '…';
};

const calculateAge = (birthdate) => {
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
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
