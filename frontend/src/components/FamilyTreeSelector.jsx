import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Tree from 'react-d3-tree';
import debounce from 'lodash.debounce';
import { buildFamilyTree, convertToD3TreeFormat, fitNodeLabel, getRecentPlayers } from '../utils/familyTree';
import { getSetting } from '../utils/settings';
import '../styles/FamilyTreeSelector.css';

function FamilyTreeSelector({ players, selectedPlayerIds, onSelectionChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  const displayNodes = getSetting('display.default_display_nodes', 20);
  const debounceMs = getSetting('search.debounce_ms', 300);
  const nodeRadius = getSetting('tree.node_radius', 20);
  const colors = getSetting('colors', {});

  // These two have been in settings.yaml all along; the tree ignored them and
  // used hardcoded 200x100 with a further 1.5x sibling separation, which left
  // roughly 300px between 40px nodes. Now they mean what they say: the distance
  // in px between neighbouring nodes.
  const horizontalSpacing = getSetting('tree.horizontal_spacing', 90);
  const verticalSpacing = getSetting('tree.vertical_spacing', 80);

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((term) => setDebouncedSearchTerm(term), debounceMs),
    [debounceMs]
  );

  useEffect(() => {
    debouncedSearch(searchTerm);
    return () => debouncedSearch.cancel();
  }, [searchTerm, debouncedSearch]);

  // Build tree data
  const treeData = useMemo(() => {
    if (!players || players.length === 0) {
      console.log('No players available');
      return [];
    }
    
    let idsToShow = new Set();
    
    // If no search term, show only recent players
    if (!debouncedSearchTerm) {
      const recentPlayers = getRecentPlayers(players, displayNodes);
      recentPlayers.forEach(p => idsToShow.add(p.id));
      console.log(`Showing ${recentPlayers.length} recent players out of ${players.length} total`);
    } else {
      console.log(`Searching for: ${debouncedSearchTerm}`);
      // When searching, show all matching players
      players.forEach(p => idsToShow.add(p.id));
    }
    
    // Build full tree with all players, then filter to show only selected IDs
    const familyTree = buildFamilyTree(players, debouncedSearchTerm, idsToShow);
    console.log('Family tree built:', familyTree);
    
    const d3Tree = convertToD3TreeFormat(familyTree);
    console.log('D3 tree data:', d3Tree);
    
    return d3Tree;
  }, [players, debouncedSearchTerm, displayNodes]);

  // Handle node click
  const handleNodeClick = useCallback((nodeData) => {
    const playerId = nodeData.data.attributes.id;
    
    if (selectedPlayerIds.includes(playerId)) {
      onSelectionChange(selectedPlayerIds.filter(id => id !== playerId));
    } else {
      onSelectionChange([...selectedPlayerIds, playerId]);
    }
  }, [selectedPlayerIds, onSelectionChange]);

  // Custom node rendering
  const renderCustomNode = ({ nodeDatum, toggleNode }) => {
    // Render invisible root but make it transparent
    const isInvisible = nodeDatum.attributes.isInvisible;
    
    if (isInvisible) {
      return (
        <g className="invisible-root">
          <circle r={0} fill="none" />
        </g>
      );
    }
    
    const isSelected = selectedPlayerIds.includes(nodeDatum.attributes.id);
    const fillColor = isSelected ? colors.node_selected : colors.node_default;

    // Long aliases used to run straight out of the circle. Fit what we can and
    // fall back to initials; the full alias stays in the tooltip below.
    const label = fitNodeLabel(nodeDatum.name, nodeRadius);

    // Baseline sits about a third of the cap height below the centre, so the
    // text stays optically centred whatever size fitNodeLabel settled on.
    const baselineY = label.fontSize * 0.35;

    return (
      <g onClick={() => handleNodeClick({ data: nodeDatum })}>
        {/* Filled circle */}
        <circle
          r={nodeRadius}
          fill={fillColor}
          stroke={colors.edge_color}
          strokeWidth="2"
          style={{ cursor: 'pointer' }}
        />
        
        {/* Text INSIDE the circle */}
        <text
          fill="#0a0e27"
          strokeWidth="0"
          x="0"
          y={baselineY}
          textAnchor="middle"
          style={{
            fontFamily: 'Courier New, monospace',
            fontSize: `${label.fontSize}px`,
            fontWeight: 'bold',
            cursor: 'pointer',
            pointerEvents: 'none'
          }}
        >
          {label.text}
        </text>
        
        {/* Tooltip info on hover */}
        <title>
          {nodeDatum.name}
          {nodeDatum.attributes.firstName && `\n${nodeDatum.attributes.firstName}`}
          {nodeDatum.attributes.middleName && ` ${nodeDatum.attributes.middleName}`}
          {nodeDatum.attributes.lastName && ` ${nodeDatum.attributes.lastName}`}
          {nodeDatum.attributes.age !== null && `\nAge: ${nodeDatum.attributes.age}`}
        </title>
      </g>
    );
  };

  // Custom path class function to mark links from invisible root
  const pathClassFunc = (linkData) => {
    if (linkData.source.data.attributes?.isInvisible) {
      return 'invisible-root-link';
    }
    return '';
  };

  // Measure container
  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('tree-container');
      if (container) {
        setDimensions({
          width: container.offsetWidth,
          height: container.offsetHeight
        });
        setTranslate({
          x: container.offsetWidth / 2,
          y: 50
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const selectedPlayers = players.filter(p => selectedPlayerIds.includes(p.id));

  return (
    <div className="family-tree-selector">
      <div className="selection-panel">
        <h3>SELECTED ({selectedPlayerIds.length})</h3>
        <div className="selected-list">
          {selectedPlayers.map(player => (
            <div key={player.id} className="selected-player">
              <span>☑ {player.alias}</span>
              <button 
                onClick={() => onSelectionChange(selectedPlayerIds.filter(id => id !== player.id))}
                className="remove-btn"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {selectedPlayerIds.length === 0 && (
          <div className="empty-selection">
            Click nodes in the tree to select players
          </div>
        )}
      </div>

      <div className="tree-panel">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="clear-btn">
              Clear
            </button>
          )}
        </div>

        <div id="tree-container" className="tree-container">
          {treeData && treeData.name !== undefined ? (
            <Tree
              data={treeData}
              translate={translate}
              orientation="vertical"
              pathFunc="step"
              pathClassFunc={pathClassFunc}
              separation={{ siblings: 1, nonSiblings: 1.35 }}
              nodeSize={{ x: horizontalSpacing, y: verticalSpacing }}
              renderCustomNodeElement={renderCustomNode}
              zoom={0.8}
              enableLegacyTransitions={true}
              transitionDuration={300}
              depthFactor={verticalSpacing}
              collapsible={false}
            />
          ) : (
            <div className="empty-tree">
              {searchTerm ? 'No players found matching search' : 'No players registered'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FamilyTreeSelector;
