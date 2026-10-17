import { useEffect, useRef } from 'react';
import { trackEvent, getAnalyticsContext } from './trackEvent';
import {
  buildScreenViewDedupeKey,
  shouldEmitScreenView,
} from './screenViewDedupe';

/**
 * Deduped screen_view tracking with in-memory suppression for Strict Mode.
 *
 * Fires once per unique userId+screen+route+session key within a short window.
 * Metadata is included in the payload but NOT in the dedupe key.
 */
export function useScreenView(
  screen: string,
  route?: string,
  metadata?: Record<string, unknown>,
) {
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  useEffect(() => {
    const ctx = getAnalyticsContext();
    const key = buildScreenViewDedupeKey({
      userId: ctx.userId,
      screen,
      route,
    });
    if (!shouldEmitScreenView(key)) return;

    void trackEvent({
      eventName: 'screen_view',
      screen,
      feature: route ?? undefined,
      metadata: metadataRef.current,
    });
  }, [screen, route]);
}
