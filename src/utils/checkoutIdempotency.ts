// Persist only a hash and random key. Customer details never enter this storage entry.
export async function checkoutAttempt(
  slug: string,
  payload: unknown,
): Promise<{ key: string; complete: () => void }> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const digest = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const storageKey = `aladay_checkout_attempt_${slug}_${digest}`;
  let key = `checkout_${crypto.randomUUID()}`;
  try {
    key = sessionStorage.getItem(storageKey) || key;
    sessionStorage.setItem(storageKey, key);
  } catch {
    /* Browsers can disable storage. */
  }
  return {
    key,
    complete: () => {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
    },
  };
}
