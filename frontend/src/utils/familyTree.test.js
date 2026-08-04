import { fitNodeLabel, buildFamilyTree, convertToD3TreeFormat } from './familyTree';

// Nodes are circles of this radius in the default settings; at 12px Courier New
// that leaves room for about four characters.
const RADIUS = 20;

const label = (name, radius = RADIUS) => fitNodeLabel(name, radius);

describe('fitNodeLabel', () => {
  test('a short alias is shown in full at the largest size', () => {
    const { text, fontSize } = label('Ada');
    expect(text).toBe('Ada');
    expect(fontSize).toBe(12);
  });

  test('a slightly long alias is kept whole by shrinking it', () => {
    // "kannin" has no initials to fall back on and is only a little too wide,
    // so it should still read as itself rather than be cut.
    const { text, fontSize } = label('kannin');
    expect(text).toBe('kannin');
    expect(fontSize).toBeLessThan(12);
    expect(fontSize).toBeGreaterThanOrEqual(8);
  });

  test('a seven-letter name still fits whole', () => {
    // "camilla" used to come out as "camil…" — half a character over the old
    // floor. Shrinking is always better than abbreviating.
    const { text } = label('camilla');
    expect(text).toBe('camilla');
  });

  test('a long multi-word alias becomes its initials', () => {
    expect(label('John Cleave Doe').text).toBe('JCD');
  });

  test('initials are upper-cased regardless of the alias', () => {
    expect(label('john cleave doe').text).toBe('JCD');
  });

  test('names separated by dots, dashes or underscores also give initials', () => {
    expect(label('john-cleave-doe').text).toBe('JCD');
    expect(label('john.cleave.doe').text).toBe('JCD');
    expect(label('john_cleave_doe').text).toBe('JCD');
  });

  test('a single long word is abbreviated, never cut mid-word', () => {
    // No initials exist for one word, so something has to give — but "Bart…"
    // reads as a word that lost its ending, where "BA" reads as a deliberate
    // abbreviation and sends the reader to the tooltip.
    const { text } = label('Bartholomew');
    expect(text).toBe('BA');
    expect(text).not.toMatch(/…/);
  });

  test('the recorded name supplies the initials when the alias will not fit', () => {
    const { text } = fitNodeLabel('bartholomew', RADIUS, {
      nameParts: ['Camilla', '', 'Andersen'],
    });
    expect(text).toBe('CA');
  });

  test('a middle name is included in the initials', () => {
    const { text } = fitNodeLabel('bartholomew', RADIUS, {
      nameParts: ['Camilla', 'Marie', 'Andersen'],
    });
    expect(text).toBe('CMA');
  });

  test('a blank name falls back to the alias rather than an empty label', () => {
    const { text } = fitNodeLabel('Bartholomew', RADIUS, {
      nameParts: ['', '', ''],
    });
    expect(text).toBe('BA');
  });

  test('a name that fits beats any abbreviation of it', () => {
    // Having a recorded name must not shorten a label that was fine as it was.
    const { text } = fitNodeLabel('Ada', RADIUS, {
      nameParts: ['Ada', '', 'Lovelace'],
    });
    expect(text).toBe('Ada');
  });

  test('whatever comes back actually fits inside the circle', () => {
    const names = [
      'Ada', 'kannin', 'J-naz', 'John Cleave Doe', 'Bartholomew',
      'Anna Bella Clara Diana Elise Fiona', 'x', 'Wolfeschlegelsteinhausen',
    ];
    for (const name of names) {
      const { text, fontSize } = label(name);
      const widthPx = text.length * fontSize * 0.6;  // Courier New advance
      expect(widthPx).toBeLessThanOrEqual(2 * RADIUS * 0.85);
    }
  });

  test('a bigger node fits more of the alias', () => {
    expect(label('John Cleave Doe', 60).text).toBe('John Cleave Doe');
  });

  test('an empty or missing alias does not blow up', () => {
    expect(label('').text).toBe('');
    expect(label(null).text).toBe('');
    expect(label(undefined).text).toBe('');
  });

  test('surrounding whitespace is ignored', () => {
    expect(label('  Ada  ').text).toBe('Ada');
  });
});

// ---------------------------------------------------------------------------
// The union layout
// ---------------------------------------------------------------------------

/** Build a player, defaulting the three relationship lists to empty. */
const player = (id, alias, relations = {}) => ({
  id,
  alias,
  parent_ids: [],
  child_ids: [],
  partner_ids: [],
  games_played: 0,
  ...relations,
});

const flatten = (node) => [node, ...(node.children || []).flatMap(flatten)];
const depth = (node) => 1 + Math.max(0, ...(node.children || []).map(depth));

/** Every appearance of a player across the whole tree. */
const appearancesOf = (roots, id) =>
  roots.flatMap(flatten)
    .flatMap((node) => node.attributes.members || [])
    .filter((member) => member.id === id);

describe('buildFamilyTree — unions', () => {
  // The bug this layout exists to fix: a tree gives every node one parent, so
  // a child of two people was drawn once under each of them.
  const twoParents = [
    player(1, 'mum', { child_ids: [3] }),
    player(2, 'dad', { child_ids: [3] }),
    player(3, 'kid', { parent_ids: [1, 2] }),
  ];

  test('a child of two people is drawn exactly once', () => {
    expect(appearancesOf(buildFamilyTree(twoParents), 3)).toHaveLength(1);
  });

  test('both parents share one node rather than heading two trees', () => {
    const roots = buildFamilyTree(twoParents);

    expect(roots).toHaveLength(1);
    expect(roots[0].attributes.members.map((m) => m.alias).sort())
      .toEqual(['dad', 'mum']);
  });

  test('a couple inferred from a shared child is marked as inferred', () => {
    // Nobody said these two were partners; the tree may draw them together but
    // must not claim a relationship that was never entered.
    expect(buildFamilyTree(twoParents)[0].attributes.isDeclared).toBe(false);
  });

  test('a declared partnership is marked as declared', () => {
    const declared = [
      player(1, 'mum', { child_ids: [3], partner_ids: [2] }),
      player(2, 'dad', { child_ids: [3], partner_ids: [1] }),
      player(3, 'kid', { parent_ids: [1, 2] }),
    ];

    expect(buildFamilyTree(declared)[0].attributes.isDeclared).toBe(true);
  });

  test('a childless couple is still drawn as a couple', () => {
    const roots = buildFamilyTree([
      player(1, 'ana', { partner_ids: [2] }),
      player(2, 'ben', { partner_ids: [1] }),
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0].attributes.members).toHaveLength(2);
  });

  test('generations hang under the union, not under one parent', () => {
    const roots = buildFamilyTree([
      player(1, 'gran', { child_ids: [3], partner_ids: [2] }),
      player(2, 'grandpa', { child_ids: [3], partner_ids: [1] }),
      player(3, 'mum', { parent_ids: [1, 2], child_ids: [5], partner_ids: [4] }),
      player(4, 'dad', { child_ids: [5], partner_ids: [3] }),
      player(5, 'kid', { parent_ids: [3, 4] }),
    ]);

    expect(roots).toHaveLength(1);
    expect(depth(roots[0])).toBe(3);
    expect(appearancesOf(roots, 5)).toHaveLength(1);
    expect(appearancesOf(roots, 3)).toHaveLength(1);
  });

  test('a person in two unions is real in one and a ghost in the other', () => {
    // ana has a child with ben and a second, childless partnership with cleo.
    // She can only hang in one place; the other appearance has to be marked.
    const roots = buildFamilyTree([
      player(1, 'ana', { child_ids: [4], partner_ids: [2, 3] }),
      player(2, 'ben', { child_ids: [4], partner_ids: [1] }),
      player(3, 'cleo', { partner_ids: [1] }),
      player(4, 'dave', { parent_ids: [1, 2] }),
    ]);

    const ana = appearancesOf(roots, 1);
    expect(ana).toHaveLength(2);
    expect(ana.filter((a) => a.isGhost)).toHaveLength(1);
    expect(ana.filter((a) => !a.isGhost)).toHaveLength(1);
  });

  test('the union with more children is the one that draws a person for real', () => {
    const roots = buildFamilyTree([
      player(1, 'ana', { child_ids: [4], partner_ids: [2, 3] }),
      player(2, 'ben', { child_ids: [4], partner_ids: [1] }),
      player(3, 'cleo', { partner_ids: [1] }),
      player(4, 'dave', { parent_ids: [1, 2] }),
    ]);

    const realNode = roots.flatMap(flatten).find((node) =>
      (node.attributes.members || []).some((m) => m.id === 1 && !m.isGhost));

    expect(realNode.attributes.members.map((m) => m.alias).sort())
      .toEqual(['ana', 'ben']);
  });

  test('a player carries their match count for the hover label', () => {
    const roots = buildFamilyTree([player(1, 'ana', { games_played: 7 })]);

    expect(roots[0].attributes.members[0].matches).toBe(7);
  });

  test('a player with no match count reads as zero rather than undefined', () => {
    const roots = buildFamilyTree([{ id: 1, alias: 'ana', parent_ids: [] }]);

    expect(roots[0].attributes.members[0].matches).toBe(0);
  });

  test('a hidden parent does not leave a gap in the union', () => {
    // Only the kid and one parent are shown; the union must be the visible
    // parent alone, not a couple with a missing half.
    const players = [
      player(1, 'mum', { child_ids: [3] }),
      player(2, 'dad', { child_ids: [3] }),
      player(3, 'kid', { parent_ids: [1, 2] }),
    ];

    const roots = buildFamilyTree(players, '', new Set([1, 3]));

    expect(appearancesOf(roots, 2)).toHaveLength(0);
    expect(appearancesOf(roots, 3)).toHaveLength(1);
  });

  test('the unsearched view pulls in a partner so a couple is never halved', () => {
    const players = [
      player(1, 'ana', { partner_ids: [2] }),
      player(2, 'ben', { partner_ids: [1] }),
    ];

    const roots = buildFamilyTree(players, '', new Set([1]));

    expect(roots[0].attributes.members.map((m) => m.alias).sort())
      .toEqual(['ana', 'ben']);
  });

  test('searching pulls in the whole family of a match', () => {
    const roots = buildFamilyTree([
      player(1, 'mum', { child_ids: [2] }),
      player(2, 'kid', { parent_ids: [1] }),
      player(3, 'stranger'),
    ], 'kid');

    expect(appearancesOf(roots, 1)).toHaveLength(1);
    expect(appearancesOf(roots, 3)).toHaveLength(0);
  });

  test('a search that matches nobody draws nothing', () => {
    expect(buildFamilyTree([player(1, 'ana')], 'zzz')).toEqual([]);
  });

  test('no players at all is an empty forest', () => {
    expect(buildFamilyTree([])).toEqual([]);
  });
});

describe('buildFamilyTree — data that should not exist', () => {
  // A is a child of C, and A and B are each other's parent. Before the loop
  // guard this recursed until the stack blew and the page went white. The API
  // refuses to create this now, but a database that already holds one has to
  // render.
  const cyclic = [
    player(1, 'C', { child_ids: [2] }),
    player(2, 'A', { parent_ids: [1, 3], child_ids: [3] }),
    player(3, 'B', { parent_ids: [2], child_ids: [2] }),
  ];

  test('a cycle terminates instead of hanging', () => {
    const roots = buildFamilyTree(cyclic);
    roots.forEach((root) => expect(depth(root)).toBeLessThan(10));
  });

  test('a cycle does not swallow the whole tree', () => {
    // Every union in a ring hangs from another union in the ring, so none of
    // them is a root. Drawing only from roots would show an empty page.
    expect(buildFamilyTree(cyclic).length).toBeGreaterThan(0);
  });
});

describe('convertToD3TreeFormat', () => {
  test('an empty forest becomes a placeholder rather than null', () => {
    const tree = convertToD3TreeFormat([]);

    expect(tree.attributes.kind).toBe('empty');
    expect(tree.children).toEqual([]);
  });

  test('a single family is its own root', () => {
    const roots = buildFamilyTree([player(1, 'ana')]);

    expect(convertToD3TreeFormat(roots)).toBe(roots[0]);
  });

  test('several families get an invisible root to hang from', () => {
    const roots = buildFamilyTree([player(1, 'ana'), player(2, 'ben')]);
    const tree = convertToD3TreeFormat(roots);

    expect(tree.attributes.kind).toBe('invisible');
    expect(tree.children).toHaveLength(2);
  });
});
