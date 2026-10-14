export function participantToken(): string {
  const key = 'cowork-participant-token';
  let token = localStorage.getItem(key);
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, token);
  }
  return token;
}
export async function relayRequest(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': participantToken() },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `Relay error ${response.status}`);
  return data;
}
