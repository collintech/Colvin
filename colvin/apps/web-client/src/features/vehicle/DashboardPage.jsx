import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import VinSearchForm from './VinSearchForm.jsx';
import VehicleResult from './VehicleResult.jsx';
import { decodeVinRequest, reportRequest } from './vehicle.api.js';
export default function DashboardPage() {
  const [report, setReport] = useState(null);
  const mutation = useMutation({
    mutationFn: async (vin) => {
      await decodeVinRequest(vin);
      return reportRequest(vin);
    },
    onSuccess: setReport,
  });
  return (
    <>
      <section className="hero">
        <h1>Vehicle intelligence lookup</h1>
        <p>Enter a VIN to decode the vehicle and retrieve available history records.</p>
      </section>
      <VinSearchForm busy={mutation.isPending} onSearch={(vin) => mutation.mutate(vin)} />
      {mutation.error && (
        <p className="error">{mutation.error.response?.data?.error?.message || 'Lookup failed'}</p>
      )}
      <VehicleResult report={report} />
    </>
  );
}
