import React from 'react';

/**
 * What a game read off a photographed score sheet arrived unsure about.
 *
 * The importer checks a transcription against arithmetic the transcriber cannot
 * check on itself — that a round does not award more tricks than it deals, that
 * a column adds up to the total written under it — and neither of those can be
 * settled without the paper. So the game is imported with its doubts attached
 * and they surface here, over the matrix, where the squares in question are.
 *
 * Above the table rather than below it because it is a reason to look at the
 * table, and dismissing it is a separate deliberate act: the warnings say this
 * might not match the paper, and only somebody holding the paper can answer
 * that. Editing a cell is not that answer.
 */
function ImportWarnings({ warnings, onAcknowledge }) {
  const lines = (warnings || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <div className="import-warnings" role="status">
      <h3>Read off a score sheet — the numbers do not all agree</h3>

      <ul>
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>

      <p>
        Compare the table below with the paper and correct anything that is
        wrong. These are the squares worth a second look, not necessarily
        mistakes.
      </p>

      <button type="button" onClick={onAcknowledge}>
        CHECKED AGAINST THE PAPER
      </button>
    </div>
  );
}

export default ImportWarnings;
