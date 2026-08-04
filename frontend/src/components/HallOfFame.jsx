import React, { useEffect, useState } from 'react';
import { hallOfFameApi } from '../api';

/**
 * The hall of fame: who won which year, and the all-time records.
 *
 * The roll of winners comes first and is the point of the panel — the records
 * below it are for arguing about. Ten years are visible at once and the rest
 * are a scroll away, which keeps the panel a fixed size however long the family
 * keeps playing.
 */
function HallOfFame() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    hallOfFameApi.get()
      .then((response) => { if (!cancelled) setData(response.data); })
      .catch((loadError) => {
        console.error('Error loading hall of fame:', loadError);
        if (!cancelled) setError(true);
      });

    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="card hall-of-fame">
        <h2>🏆 HALL OF FAME</h2>
        <p className="empty-note attention">Could not load the hall of fame.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card hall-of-fame">
        <h2>🏆 HALL OF FAME</h2>
        <p className="empty-note">LOADING...</p>
      </div>
    );
  }

  const { album_url: albumUrl, tournament_winners: winners, records } = data;

  return (
    <div className="card hall-of-fame">
      <h2>🏆 HALL OF FAME</h2>

      <h3>TOURNAMENT WINNERS</h3>
      {winners.length === 0 ? (
        <p className="empty-note">No tournament has been played yet.</p>
      ) : (
        <div className="winners-scroll">
          <table className="winners">
            <tbody>
              {winners.map((winner) => (
                <tr key={winner.year}>
                  <td className="year">{winner.year}</td>
                  <td className="winner-name">
                    {winner.player_alias}
                    {winner.is_historical && (
                      // Nothing in the database says this; someone wrote it down.
                      <span className="text-small" title="From before this app existed"> ※</span>
                    )}
                  </td>
                  <td className="text-key">{winner.score ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section">RECORDS</h3>
      <dl className="records">
        {records.map((record) => (
          <React.Fragment key={record.key}>
            <dt>{record.label}</dt>
            <dd>
              <span className="text-key">{record.player_alias || '—'}</span>
              {' '}
              <span className="record-value">{record.display}</span>
              {record.detail && <span className="text-small"> ({record.detail})</span>}
            </dd>
          </React.Fragment>
        ))}
      </dl>

      {albumUrl && (
        <p className="album-link">
          <a href={albumUrl} target="_blank" rel="noopener noreferrer">
            📷 PHOTO ALBUM
          </a>
        </p>
      )}
    </div>
  );
}

export default HallOfFame;
