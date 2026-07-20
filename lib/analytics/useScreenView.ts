import { useEffect, useRef } from 'react';
import { trackEvent } from './trackEvent';

/**
 * Deduped screen_view tracking.
 *
 * Fires once per unique `screen::route` key per component mount.
 * Metadata is included in the payload but NOT in the dedupe key (avoids
 * unstable object references causing duplicate events).
 */
export function useScreenView(
  screen: string,
  route?: string,
  metadata?: Record<string, unknown>,
) {
  const lastKeyRef = useRef<string | null>(null);
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  useEffect(() => {
    const key = `${screen}::${route ?? ''}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    void trackEvent({
      eventName: 'screen_view',
      screen,
      feature: route ?? undefined,
      metadata: metadataRef.current,
    });
  }, [screen, route]);
}
