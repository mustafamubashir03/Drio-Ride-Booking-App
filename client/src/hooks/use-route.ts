import { useEffect, useRef, useState } from 'react';
import { fetchRoute, type RouteResult, type SelectedLocation } from '@/lib/places-api';

export type RouteStatus = 'idle' | 'loading' | 'success' | 'error';

export function useRoute(from: SelectedLocation | null, to: SelectedLocation | null) {
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [status, setStatus] = useState<RouteStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const requestSeq = useRef(0);

    const fromKey = from ? `${from.longitude},${from.latitude}` : null;
    const toKey = to ? `${to.longitude},${to.latitude}` : null;

    useEffect(() => {
        const seq = ++requestSeq.current;
        let cancelled = false;

        if (!fromKey || !toKey) {
            queueMicrotask(() => {
                if (cancelled || seq !== requestSeq.current) return;
                setRoute(null);
                setStatus('idle');
                setError(null);
            });
            return () => {
                cancelled = true;
            };
        }

        queueMicrotask(() => {
            if (cancelled || seq !== requestSeq.current) return;
            setRoute(null);
            setStatus('loading');
            setError(null);

            fetchRoute(from!, to!)
                .then((result) => {
                    if (cancelled || seq !== requestSeq.current) return;
                    setRoute(result);
                    setStatus('success');
                    setError(null);
                })
                .catch((e: unknown) => {
                    if (cancelled || seq !== requestSeq.current) return;
                    setRoute(null);
                    setStatus('error');
                    setError(
                        e instanceof Error
                            ? e.message
                            : 'Could not calculate a route right now.',
                    );
                });
        });

        return () => {
            cancelled = true;
        };
        // from/to are used only while both are set; guarded by fromKey/toKey
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fromKey, toKey]);

    return { route, status, error };
}