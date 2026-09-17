import { useCallback, useEffect, useRef, useState } from 'react';
import { searchPlaces, type PlaceResult } from '@/lib/places-api';

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

export type PlaceSearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export function usePlaceSearch() {
    const [query, setQueryState] = useState('');
    const [results, setResults] = useState<PlaceResult[]>([]);
    const [status, setStatus] = useState<PlaceSearchStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const requestSeq = useRef(0);

    const setQuery = useCallback((value: string) => {
        setQueryState(value);
        if (value.trim().length < MIN_QUERY_LENGTH) {
            requestSeq.current += 1;
            setResults([]);
            setStatus('idle');
            setError(null);
        }
    }, []);

    const reset = useCallback(() => {
        requestSeq.current += 1;
        setQueryState('');
        setResults([]);
        setStatus('idle');
        setError(null);
    }, []);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < MIN_QUERY_LENGTH) return;

        const seq = ++requestSeq.current;

        const timer = window.setTimeout(() => {
            setStatus('loading');
            setError(null);

            searchPlaces(trimmed)
                .then((r) => {
                    if (seq !== requestSeq.current) return;
                    setResults(r);
                    setStatus(r.length > 0 ? 'success' : 'empty');
                })
                .catch((e: unknown) => {
                    if (seq !== requestSeq.current) return;
                    setResults([]);
                    setStatus('error');
                    setError(e instanceof Error ? e.message : 'Could not search locations right now.');
                });
        }, DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [query]);

    return {
        query,
        setQuery,
        results,
        status,
        error,
        reset,
    };
}