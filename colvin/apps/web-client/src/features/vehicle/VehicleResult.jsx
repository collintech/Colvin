export default function VehicleResult({ report }) {
  if (!report) return null;
  const v = report.vehicle;
  const hasDetails = [v.modelYear, v.make, v.model, v.manufacturer, v.country, v.bodyClass].some(
    Boolean,
  );
  const { engineCode, engineDisplacementCcm, trim } = v.attributes ?? {};
  const specifications = [
    ['Engine code', engineCode],
    [
      'Engine displacement',
      typeof engineDisplacementCcm === 'string' && engineDisplacementCcm.trim()
        ? `${engineDisplacementCcm} cc`
        : null,
    ],
    ['Trim (provider value)', trim],
  ].filter(([, value]) => typeof value === 'string' && value.trim());
  const hasModel = Boolean(v.make && v.model && v.modelYear);
  return (
    <section className="results">
      <article className="card">
        <h2>
          {hasModel
            ? [v.modelYear, v.make, v.model].join(' ')
            : hasDetails
              ? 'Partial vehicle identification'
              : 'Vehicle details unavailable'}
        </h2>
        {!hasModel && (
          <p>
            {hasDetails
              ? 'Some vehicle details could not be confirmed.'
              : 'The available decoder data did not identify this vehicle.'}
          </p>
        )}
        <dl>
          <div>
            <dt>VIN</dt>
            <dd>{v.vin}</dd>
          </div>
          {!hasModel &&
            [
              ['Make', v.make],
              ['Model', v.model],
              ['Model year', v.modelYear],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || 'Unavailable'}</dd>
              </div>
            ))}
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
          {specifications.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
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
