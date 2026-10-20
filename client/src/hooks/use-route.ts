import { useEffect, useRef, useState } from 'react';
import { fetchRoute, type RouteResult, type SelectedLocation } from '@/lib/places-api';
import { calculateFare, type RideCategory } from '@/lib/fare';

export type RouteStatus = 'idle' | 'loading' | 'success' | 'error';

export function useRoute(from: SelectedLocation | null, to: SelectedLocation | null, category?: string) {
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [status, setStatus] = useState<RouteStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const requestSeq = useRef(0);
    const baseRouteRef = useRef<Omit<RouteResult, 'fare'> | null>(null);

    const fromKey = from ? `${from.longitude},${from.latitude}` : null;
    const toKey = to ? `${to.longitude},${to.latitude}` : null;

    // Fetch route (distance/duration/geometry) only when from/to change
    useEffect(() => {
        const seq = ++requestSeq.current;
        let cancelled = false;

        if (!fromKey || !toKey) {
            queueMicrotask(() => {
                if (cancelled || seq !== requestSeq.current) return;
                setRoute(null);
                baseRouteRef.current = null;
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
            baseRouteRef.current = null;
            setStatus('loading');
            setError(null);

            fetchRoute(from!, to!, undefined)
                .then((result) => {
                    if (cancelled || seq !== requestSeq.current) return;
                    baseRouteRef.current = { distance: result.distance, duration: result.duration, geometry: result.geometry };
                    setRoute(result);
                    setStatus('success');
                    setError(null);
                })
                .catch((e: unknown) => {
                    if (cancelled || seq !== requestSeq.current) return;
                    baseRouteRef.current = null;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fromKey, toKey]);

    // Calculate fare locally when category or from/to change (no network request needed)
    useEffect(() => {
        if (baseRouteRef.current && category) {
            const fare = calculateFare(baseRouteRef.current.distance / 1000, category as RideCategory);
            setRoute(prev => prev ? { ...prev, fare } : null);
        } else if (baseRouteRef.current && !category) {
            setRoute(prev => prev ? { ...prev, fare: 0 } : null);
        }
    }, [category, fromKey, toKey]);

    return { route, status, error };
}