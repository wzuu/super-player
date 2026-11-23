const root = new URL('../', import.meta.url);
const prefix = 'super-player:profiles:' + root.pathname;
export function profiles() {
  try {
    return JSON.parse(localStorage.getItem(prefix)) ?? [];
  } catch {
    return [];
  }
}
export function activeProfile() {
  if (location.protocol !== 'file:')
    return document.cookie.match(/(?:^|; )super_player_profile=([a-f0-9-]{36})(?:;|$)/)?.[1] ?? '';
  try {
    return localStorage.getItem(prefix + ':active') ?? '';
  } catch {
    return '';
  }
}
export function selectProfile(id) {
  if (location.protocol === 'file:') localStorage.setItem(prefix + ':active', id);
  else
    document.cookie =
      'super_player_profile=' +
      id +
      '; Path=' +
      root.pathname +
      '; Max-Age=' +
      (id ? 31536000 : 0) +
      '; SameSite=Strict';
}
export function createProfile() {
  const id = crypto.randomUUID();
  localStorage.setItem(prefix, JSON.stringify([...profiles(), { id, created: Date.now() }]));
  selectProfile(id);
}
