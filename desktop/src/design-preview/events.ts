// Preview data is local to the browser; it has no native event subscriptions.
export async function listen<T>(_event: string, _handler: (event: { payload: T }) => void) {
  return () => undefined;
}
