import { useEffect, useRef } from 'react';
import { initializeSocket } from '../config/socket';
import { getAccessToken, useAuth } from '../contexts/AuthContext';
import { extractPropertyAccountChangeIds, PropertyAccountChangeIds } from '../utils/paymentsChanged';

export type PropertyAccountRefreshSource = 'payments' | 'socket' | 'reconnect' | 'visibility';

/**
 * Invalidation signals only. Callers must refetch authoritative API data.
 * Sources: same-tab payments:changed, Socket.io propertyAccount.updated,
 * socket reconnect, and tab/window becoming visible. No interval polling.
 */
export function usePropertyAccountLiveRefresh(
  onRefresh: (source: PropertyAccountRefreshSource, ids: PropertyAccountChangeIds) => void
): void {
  const { isAuthenticated } = useAuth();
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const onPaymentsChanged = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      onRefreshRef.current('payments', extractPropertyAccountChangeIds(detail));
    };
    window.addEventListener('payments:changed', onPaymentsChanged as EventListener);
    return () => {
      window.removeEventListener('payments:changed', onPaymentsChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = getAccessToken?.();
    if (!token) return;
    try {
      const socket = initializeSocket(token);
      const onUpdated = (payload: any) => {
        onRefreshRef.current('socket', extractPropertyAccountChangeIds(payload));
      };
      let seenConnect = socket.connected;
      const onConnect = () => {
        if (seenConnect) {
          onRefreshRef.current('reconnect', {});
        }
        seenConnect = true;
      };
      socket.on('propertyAccount.updated', onUpdated);
      socket.on('connect', onConnect);
      return () => {
        socket.off('propertyAccount.updated', onUpdated);
        socket.off('connect', onConnect);
      };
    } catch (error) {
      console.error('Property account live refresh: socket init failed', error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let backgrounded = false;
    const markBackgrounded = () => {
      backgrounded = true;
    };
    const onBecameActive = () => {
      if (!backgrounded) return;
      backgrounded = false;
      onRefreshRef.current('visibility', {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markBackgrounded();
        return;
      }
      if (document.visibilityState === 'visible') onBecameActive();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', markBackgrounded);
    window.addEventListener('focus', onBecameActive);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', markBackgrounded);
      window.removeEventListener('focus', onBecameActive);
    };
  }, []);
}
