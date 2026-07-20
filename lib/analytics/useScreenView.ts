import { useEffect, useRef } from 'react';
import { trackEvent } from './trackEvent';

/**
 * Deduped screen_view tracking — fires once per unique screen+route key per mount session.
 */
export function useScreenView(screen: string, route?: string, metadata?: Record<string, unknown>) {
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${screen}::${route ?? ''}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    void trackEvent({
      eventName: 'screen_view',
      screen,
      feature: route ?? undefined,
      metadata,
    });
  }, [screen, route, metadata]);
}
