/**
 * Build hierarchical tree structure from flat player list
 * Players are sorted by age (oldest first) within each generation
 */

export const buildFamilyTree = (players, searchTerm = '') => {
  if (!players || players.length === 0) return [];
  
  // Filter by search term if provided
  const filteredPlayers = searchTerm
    ? players.filter(p => 
        p.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.first_name && p.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.last_name && p.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : players;
  
  if (filteredPlayers.length === 0) return [];
  
  // Create lookup map
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
  
  // Find root nodes (no parents)
  const roots = Array.from(playerMap.values()).filter(p => 
    !p.parent_ids || p.parent_ids.length === 0
  );
  
  // Sort roots by age
  roots.sort((a, b) => {
    if (!a.birthdate && !b.birthdate) return 0;
    if (!a.birthdate) return 1;
    if (!b.birthdate) return -1;
    return new Date(a.birthdate) - new Date(b.birthdate);
  });
  
  // If searching, filter tree to only show matching nodes and their ancestors/descendants
  if (searchTerm) {
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
    
    // Filter tree to only relevant nodes
    const filterTree = (nodes) => {
      return nodes
        .filter(node => relevantIds.has(node.id))
        .map(node => ({
          ...node,
          children: filterTree(node.children)
        }));
    };
    
    return filterTree(roots);
  }
  
  return roots;
};

/**
 * Convert family tree to react-d3-tree format
 */
export const convertToD3TreeFormat = (familyTree) => {
  const convert = (node) => ({
    name: node.alias,
    attributes: {
      id: node.id,
      firstName: node.first_name || '',
      middleName: node.middle_name || '',
      lastName: node.last_name || '',
      birthdate: node.birthdate || '',
      age: node.birthdate ? calculateAge(node.birthdate) : null
    },
    children: node.children.map(convert)
  });
  
  return familyTree.map(convert);
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
 * Get recent players (sorted by registration date)
 */
export const getRecentPlayers = (players, limit = 20) => {
  return [...players]
    .sort((a, b) => new Date(b.registration_date) - new Date(a.registration_date))
    .slice(0, limit);
};
