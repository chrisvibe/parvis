import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Tree from 'react-d3-tree';
import debounce from 'lodash.debounce';
import { buildFamilyTree, convertToD3TreeFormat, fitNodeLabel, getRecentPlayers } from '../utils/familyTree';
import { moveItem } from '../utils/reorder';
import { getSetting } from '../utils/settings';
import { color } from '../utils/theme';
import '../styles/FamilyTreeSelector.css';

// Gap between the two circles of a couple, as a fraction of node radius. Wide
// enough that the bar between them reads as a link rather than a join.
const COUPLE_GAP_FRACTION = 0.9;

function FamilyTreeSelector({ players, selectedPlayerIds, onSelectionChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const displayNodes = getSetting('display.default_display_nodes', 20);
  const debounceMs = getSetting('search.debounce_ms', 300);
  const nodeRadius = getSetting('tree.node_radius', 20);

  // These two have been in settings.yaml all along; the tree ignored them and
  // used hardcoded 200x100 with a further 1.5x sibling separation, which left
  // roughly 300px between 40px nodes. Now they mean what they say: the distance
  // in px between neighbouring nodes.
  const horizontalSpacing = getSetting('tree.horizontal_spacing', 90);
  const verticalSpacing = getSetting('tree.vertical_spacing', 80);

  const debouncedSearch = useMemo(
    () => debounce((term) => setDebouncedSearchTerm(term), debounceMs),
    [debounceMs]
  );

  useEffect(() => {
    debouncedSearch(searchTerm);
    return () => debouncedSearch.cancel();
  }, [searchTerm, debouncedSearch]);

  const treeData = useMemo(() => {
    if (!players || players.length === 0) return null;

    // Without a search this is a "recent players" view rather than everyone;
    // with one, every player is a candidate.
    const idsToShow = new Set(
      (debouncedSearchTerm ? players : getRecentPlayers(players, displayNodes))
        .map((p) => p.id)
    );

    return convertToD3TreeFormat(
      buildFamilyTree(players, debouncedSearchTerm, idsToShow)
    );
  }, [players, debouncedSearchTerm, displayNodes]);

  // A couple occupies two circles, so every node needs room for the widest one
  // — react-d3-tree gives all nodes the same box.
  const widestUnion = useMemo(() => {
    if (!treeData) return 1;
    const walk = (node) => Math.max(
      node.attributes?.members?.length || 1,
      ...(node.children || []).map(walk)
    );
    return walk(treeData);
  }, [treeData]);

  const togglePlayer = useCallback((playerId) => {
    if (selectedPlayerIds.includes(playerId)) {
      onSelectionChange(selectedPlayerIds.filter(id => id !== playerId));
    } else {
      onSelectionChange([...selectedPlayerIds, playerId]);
    }
  }, [selectedPlayerIds, onSelectionChange]);

  const renderCustomNode = ({ nodeDatum }) => {
    const { kind, members = [], isDeclared } = nodeDatum.attributes || {};

    // The wrapper that holds a forest together is structural, not a person.
    if (kind === 'invisible' || kind === 'empty') {
      return <g className="invisible-root"><circle r={0} fill="none" /></g>;
    }

    const spacing = nodeRadius * (2 + COUPLE_GAP_FRACTION);
    const offsetFor = (index) => (index - (members.length - 1) / 2) * spacing;

    return (
      <g>
        {/* The bar joining a couple. Dashed when the partnership was inferred
            from a shared child rather than recorded by anyone. */}
        {members.length > 1 && (
          <line
            className={isDeclared ? 'union-bar' : 'union-bar inferred'}
            x1={offsetFor(0)}
            x2={offsetFor(members.length - 1)}
            y1={0}
            y2={0}
            stroke={color('--edge-color')}
          />
        )}

        {members.map((member, index) => (
          <PersonCircle
            key={member.id}
            member={member}
            x={offsetFor(index)}
            radius={nodeRadius}
            isSelected={selectedPlayerIds.includes(member.id)}
            onClick={() => togglePlayer(member.id)}
          />
        ))}
      </g>
    );
  };

  const pathClassFunc = (linkData) => {
    const source = linkData.source.data.attributes || {};
    const target = linkData.target.data.attributes || {};

    if (source.kind === 'invisible') return 'invisible-root-link';
    // The link to a duplicate is dashed, so a ghost never looks like a second
    // person who happens to share a name.
    if (target.kind === 'ghost') return 'ghost-link';
    return '';
  };

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('tree-container');
      if (container) {
        setTranslate({ x: container.offsetWidth / 2, y: 60 });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // In the order they were picked, which is the order they will sit in — and
  // therefore the order they bid in. This list used to be built by filtering
  // the roster, so it showed the players sorted one way while the game was
  // created with them in another.
  const selectedPlayers = selectedPlayerIds
    .map((id) => players.find((player) => player.id === id))
    .filter(Boolean);

  const moveSelected = (from, to) => {
    onSelectionChange(moveItem(selectedPlayerIds, from, to));
  };

  return (
    <div className="family-tree-selector">
      <div className="selection-panel">
        <h3>SELECTED ({selectedPlayerIds.length})</h3>
        {/* Seat order, so it is worth showing the number and letting it be
            changed here rather than only once the game has started. */}
        {selectedPlayerIds.length > 1 && (
          <div className="field-hint">Order of play — first to bid at the top.</div>
        )}
        <div className="selected-list">
          {selectedPlayers.map((player, seat) => (
            <div key={player.id} className="selected-player">
              <span>{seat + 1}. {player.alias}</span>
              <span className="seat-controls">
                <button
                  onClick={() => moveSelected(seat, seat - 1)}
                  disabled={seat === 0}
                  aria-label={`Move ${player.alias} earlier`}
                >
                  ▲
                </button>
                <button
                  onClick={() => moveSelected(seat, seat + 1)}
                  disabled={seat === selectedPlayers.length - 1}
                  aria-label={`Move ${player.alias} later`}
                >
                  ▼
                </button>
                <button
                  onClick={() => onSelectionChange(selectedPlayerIds.filter(id => id !== player.id))}
                  className="remove-btn"
                >
                  ✕
                </button>
              </span>
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
          {treeData && treeData.attributes?.kind !== 'empty' ? (
            <Tree
              data={treeData}
              translate={translate}
              orientation="vertical"
              pathFunc="step"
              pathClassFunc={pathClassFunc}
              separation={{ siblings: 1, nonSiblings: 1.35 }}
              nodeSize={{ x: horizontalSpacing * widestUnion, y: verticalSpacing }}
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

/**
 * One person inside a node.
 *
 * A ghost is the same player drawn a second time — under their own parents when
 * the couple they belong to hangs elsewhere. It is outlined rather than filled
 * so it reads as a cross-reference, and it selects the same player.
 */
function PersonCircle({ member, x, radius, isSelected, onClick }) {
  // The recorded name is passed too: when the alias will not fit, initials of
  // the real name ("CA") beat anything derivable from the alias alone.
  const label = fitNodeLabel(member.alias, radius, {
    nameParts: [member.firstName, member.middleName, member.lastName],
  });

  // Baseline sits about a third of the cap height below the centre, so the text
  // stays optically centred whatever size fitNodeLabel settled on.
  const baselineY = label.fontSize * 0.35;

  const fill = member.isGhost
    ? 'transparent'
    : color(isSelected ? '--node-selected' : '--node-default');

  return (
    <g
      transform={`translate(${x}, 0)`}
      className={member.isGhost ? 'person ghost' : 'person'}
      onClick={onClick}
    >
      <circle
        r={radius}
        fill={fill}
        stroke={color(isSelected ? '--node-selected' : '--edge-color')}
        strokeWidth="2"
        strokeDasharray={member.isGhost ? '4 3' : undefined}
      />

      <text
        x="0"
        y={baselineY}
        textAnchor="middle"
        strokeWidth="0"
        fill={member.isGhost ? color('--fg') : color('--fg-inverse')}
        style={{
          fontFamily: 'Courier New, monospace',
          fontSize: `${label.fontSize}px`,
          fontWeight: 'bold',
          pointerEvents: 'none',
        }}
      >
        {label.text}
      </text>

      <title>
        {member.alias}
        {member.firstName && `\n${member.firstName}`}
        {member.middleName && ` ${member.middleName}`}
        {member.lastName && ` ${member.lastName}`}
        {`\nMatches: ${member.matches}`}
        {member.isGhost && '\n(also shown elsewhere)'}
      </title>
    </g>
  );
}

export default FamilyTreeSelector;
