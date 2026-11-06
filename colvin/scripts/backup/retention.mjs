const namePattern = /^colvin-auto-(\d{8}T\d{6}Z)-([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;

export function snapshotTime(name) {
  const match = namePattern.exec(name);
  if (!match) return null;
  const stamp = match[1];
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  const date = new Date(iso);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().replace(/[-:]/g, '').replace('.000', '') !== stamp
  )
    return null;
  return date;
}

const isoWeek = (date) => {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  return `${year}-${Math.ceil(((thursday - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)}`;
};

export function retentionPlan(names, current, now = new Date()) {
  if (!snapshotTime(current) || new Set(names).size !== names.length)
    throw new Error('Invalid retention inventory');
  const managed = names
    .map((name) => ({ name, date: snapshotTime(name) }))
    .filter((x) => x.date && x.date <= now)
    .sort((a, b) => b.date - a.date || b.name.localeCompare(a.name));
  if (!managed.some((x) => x.name === current))
    throw new Error('Current backup missing from retention inventory');
  const keep = new Set(managed.slice(0, 14).map((x) => x.name));
  for (const [count, group] of [
    [4, isoWeek],
    [3, (date) => date.toISOString().slice(0, 7)],
  ]) {
    const groups = new Set();
    for (const item of managed) {
      const key = group(item.date);
      if (!groups.has(key) && groups.size < count) {
        groups.add(key);
        keep.add(item.name);
      }
    }
  }
  keep.add(current);
  return {
    keep: [...keep],
    remove: managed.filter((x) => !keep.has(x.name)).map((x) => x.name),
    ignored: names.length - managed.length,
  };
}
