export type SelectedLocation = {
    id?: string;
    name: string;
    displayName?: string;
    latitude: number;
    longitude: number;
};

export type PlaceResult = {
    id: string;
    name: string;
    displayName: string;
    latitude: number;
    longitude: number;
    category?: string;
};

export type PlaceSearchResponse = {
    results: PlaceResult[];
};

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
    const encoded = encodeURIComponent(query);
    const response = await fetch(`/api/places/search?q=${encoded}`, {
        headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
        let message = `Place search failed (${response.status})`;
        try {
            const err = (await response.json()) as { message?: string };
            if (err?.message) message = err.message;
        } catch {
            // fall back to the generic message
        }
        throw new Error(message);
    }

    const data = (await response.json()) as PlaceSearchResponse;
    return data.results ?? [];
}

export type RouteLineString = {
    type: "LineString";
    coordinates: [number, number][];
};

export type RouteResult = {
    distance: number;
    duration: number;
    fare: number;
    geometry: RouteLineString;
};

export type RouteRequestError = {
    message: string;
};

export async function fetchRoute(
    from: SelectedLocation,
    to: SelectedLocation,
): Promise<RouteResult> {
    const url =
        `/api/routes?from=${from.longitude},${from.latitude}` +
        `&to=${to.longitude},${to.latitude}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
        });
    } finally {
        window.clearTimeout(timeout);
    }

    if (!response.ok) {
        let message = `Route request failed (${response.status})`;
        try {
            const err = (await response.json()) as RouteRequestError;
            if (err?.message) message = err.message;
        } catch {
            // fall back to the generic message
        }
        throw new Error(message);
    }

    const data = (await response.json()) as {
        success?: boolean;
        route?: RouteResult;
    };
    if (!data?.route) {
        throw new Error('Route request returned no route data');
    }
    return data.route;
}