export default function VehicleResult({ report }) {
  if (!report) return null;
  const v = report.vehicle;
  return (
    <section className="results">
      <article className="card">
        <h2>{[v.modelYear, v.make, v.model].filter(Boolean).join(' ') || 'Decoded vehicle'}</h2>
        <dl>
          <div>
            <dt>VIN</dt>
            <dd>{v.vin}</dd>
          </div>
          <div>
            <dt>Manufacturer</dt>
            <dd>{v.manufacturer || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{v.country || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Body class</dt>
            <dd>{v.bodyClass || 'Unavailable'}</dd>
          </div>
        </dl>
      </article>
      <article className="card">
        <h2>History summary</h2>
        <p>{report.summary.totalRecords} record(s) found.</p>
        {report.history.length === 0 ? (
          <p>No verified history records are currently available.</p>
        ) : (
          <ul>
            {report.history.map((r) => (
              <li key={r.id}>
                <strong>{r.recordType}</strong>: {r.summary}{' '}
                <small>
                  ({r.sourceName}, confidence {Math.round(r.confidence * 100)}%)
                </small>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
