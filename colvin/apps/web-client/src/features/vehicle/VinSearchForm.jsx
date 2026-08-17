import { useState } from 'react';
export default function VinSearchForm({ onSearch, busy }) {
  const [vin, setVin] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onSearch(vin.trim().toUpperCase());
  };
  return (
    <form className="card vin-form" onSubmit={submit}>
      <label>
        Vehicle identification number
        <input
          value={vin}
          onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))}
          minLength="17"
          maxLength="17"
          placeholder="17-character VIN"
          required
        />
      </label>
      <button disabled={busy || vin.length !== 17}>
        {busy ? 'Searching…' : 'Get vehicle report'}
      </button>
    </form>
  );
}
