let session = null;

export function getSession() {
  return session;
}

export function setSession(value) {
  session = value;
}

export function clearSession() {
  session = null;
}
