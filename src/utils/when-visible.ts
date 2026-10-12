/**
 * Runs `then` once the page is in view: now, or when the player comes back
 * to the tab. Returns a function that cancels a call still waiting.
 */
export function whenVisible(
  then: () => void,
  page: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  > = document
): () => void {
  if (page.visibilityState === 'visible') {
    then();
    return () => undefined;
  }
  const onChange = () => {
    if (page.visibilityState !== 'visible') return;
    page.removeEventListener('visibilitychange', onChange);
    then();
  };
  page.addEventListener('visibilitychange', onChange);
  return () => {
    page.removeEventListener('visibilitychange', onChange);
  };
}
