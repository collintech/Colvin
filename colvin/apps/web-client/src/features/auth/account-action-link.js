// Tokens remain in React memory; never copy them into storage or rendered text.
export function readAccountActionToken({ search = '', hash = '' }) {
  if (search.length + hash.length > 2048) return '';
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const tokens = [...query.getAll('token'), ...fragment.getAll('token')];
  if (tokens.length !== 1) return '';
  const [token] = tokens;
  return token.length >= 32 && token.length <= 256 ? token : '';
}

export function clearAccountActionUrl(history, pathname) {
  if (!['/reset-password', '/verify-email'].includes(pathname)) return;
  history.replaceState(history.state, '', pathname);
}
