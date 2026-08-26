const defaultFlights = new Map();

export function singleFlight(key, work, flights = defaultFlights) {
  const existing = flights.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(work)
    .finally(() => {
      if (flights.get(key) === promise) flights.delete(key);
    });

  flights.set(key, promise);
  return promise;
}
