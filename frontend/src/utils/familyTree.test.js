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
    expect(fontSize).toBeGreaterThanOrEqual(9);
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

  test('a single long word is truncated with an ellipsis', () => {
    // No initials exist for one word, so something has to give.
    const { text } = label('Bartholomew');
    expect(text).toMatch(/…$/);
    expect(text.length).toBeLessThan('Bartholomew'.length);
    expect('Bartholomew'.startsWith(text.replace('…', ''))).toBe(true);
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

describe('convertToD3TreeFormat', () => {
  // A is a child of C, and A and B are each other's parent. Before the loop
  // guard this recursed until the stack blew and the page went white.
  const cyclicPlayers = [
    { id: 1, alias: 'C', parent_ids: [] },
    { id: 2, alias: 'A', parent_ids: [1, 3] },
    { id: 3, alias: 'B', parent_ids: [2] },
  ];

  const depth = (node) => 1 + Math.max(0, ...node.children.map(depth));

  test('a cycle in the data terminates instead of hanging', () => {
    const tree = convertToD3TreeFormat(buildFamilyTree(cyclicPlayers));
    expect(depth(tree)).toBeLessThan(10);
  });

  test('the repeated node is marked rather than silently dropped', () => {
    const tree = convertToD3TreeFormat(buildFamilyTree(cyclicPlayers));
    const flatten = (n) => [n, ...n.children.flatMap(flatten)];
    expect(flatten(tree).some(n => n.attributes.isLoop)).toBe(true);
  });

  test('an ordinary tree is unaffected', () => {
    const players = [
      { id: 1, alias: 'gran', parent_ids: [] },
      { id: 2, alias: 'mum', parent_ids: [1] },
      { id: 3, alias: 'kid', parent_ids: [2] },
    ];
    const tree = convertToD3TreeFormat(buildFamilyTree(players));
    expect(tree.name).toBe('gran');
    expect(depth(tree)).toBe(3);
    expect(tree.children[0].attributes.isLoop).toBeUndefined();
  });
});
