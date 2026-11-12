// Bound both connection and response-body time even when an integration provides its own controller.
export const timedFetch: typeof globalThis.fetch = (input, init) => {
  const deadline = AbortSignal.timeout(15000);
  return globalThis.fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
  });
};
