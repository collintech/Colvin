const KEY = 'colvin-session';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function setSession(value) {
  localStorage.setItem(KEY, JSON.stringify(value));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
