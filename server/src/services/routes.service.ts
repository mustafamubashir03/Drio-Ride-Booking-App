import logger from "../config/logger.config";
import { BadRequestError, InternalServerError } from "../utils/errors/app.error";

export interface RouteCoordinates {
    longitude: number;
    latitude: number;
}

export interface RouteGeometry {
    type: "LineString";
    coordinates: [number, number][];
}

export interface RouteResult {
    distance: number;
    duration: number;
    geometry: RouteGeometry;
}

const OSRM_API_BASE_URL = process.env.OSRM_API_BASE_URL ?? "https://router.project-osrm.org";

interface OsrmRouteGeometry {
    type?: string;
    coordinates?: unknown;
}

interface OsrmRoute {
    distance?: unknown;
    duration?: unknown;
    geometry?: OsrmRouteGeometry;
}

interface OsrmResponse {
    code?: string;
    message?: string;
    routes?: OsrmRoute[];
}

const buildOsrmUrl = (from: RouteCoordinates, to: RouteCoordinates): string =>
    `${OSRM_API_BASE_URL}/route/v1/driving/` +
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?alternatives=false&overview=full&geometries=geojson&steps=false`;

const normalizeOsrmResponse = (data: unknown, url: string): RouteResult => {
    const payload = data as OsrmResponse | null;

    if (!payload || payload.code !== "Ok" || !Array.isArray(payload.routes) || payload.routes.length === 0) {
        const code = payload?.code;
        if (code === "NoRoute") {
            logger.warn("OSRM reported no route", { code, url });
            throw new BadRequestError("No route found between the selected locations");
        }
        logger.error("OSRM returned an unexpected response", { code, url });
        throw new InternalServerError("Route service returned an unexpected response");
    }

    const route = payload.routes[0];
    const distance = route?.distance;
    const duration = route?.duration;
    const geometry = route?.geometry;

    const isNumber = (value: unknown): value is number =>
        typeof value === "number" && Number.isFinite(value);

    if (
        !isNumber(distance) ||
        !isNumber(duration) ||
        !geometry ||
        geometry.type !== "LineString" ||
        !Array.isArray(geometry.coordinates) ||
        geometry.coordinates.length < 2
    ) {
        logger.error("OSRM route payload is malformed", { url });
        throw new InternalServerError("Route service returned an unexpected response");
    }

    return {
        distance,
        duration,
        geometry: {
            type: "LineString",
            coordinates: geometry.coordinates as [number, number][],
        },
    };
};

export const getRoute = async (from: RouteCoordinates, to: RouteCoordinates): Promise<RouteResult> => {
    const url = buildOsrmUrl(from, to);

    let response: Response;
    try {
        response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (error) {
        logger.error("OSRM request failed", { url, error: (error as Error).message });
        throw new InternalServerError("Route service is unavailable");
    }

    if (!response.ok) {
        logger.error("OSRM returned an error", { status: response.status, url });
        throw new InternalServerError("Route service is unavailable");
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch (error) {
        logger.error("OSRM returned invalid JSON", { url, error: (error as Error).message });
        throw new InternalServerError("Route service returned an unexpected response");
    }

    return normalizeOsrmResponse(data, url);
};