import logger from "../config/logger.config";
import { InternalServerError } from "../utils/errors/app.error";

const PHOTON_API_BASE_URL = process.env.PHOTON_API_BASE_URL ?? "https://photon.komoot.io/api";
const PHOTON_LANG = "en";
const RESULT_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;

export interface PlaceResult {
    id: string;
    name: string;
    displayName: string;
    latitude: number;
    longitude: number;
    category?: string;
}

interface PhotonFeature {
    geometry?: {
        coordinates?: [number, number];
    };
    properties?: {
        osm_type?: string;
        osm_id?: number | string;
        osm_key?: string;
        osm_value?: string;
        name?: string;
        street?: string;
        housenumber?: string;
        postcode?: string;
        district?: string;
        locality?: string;
        city?: string;
        county?: string;
        state?: string;
        country?: string;
    };
}

const normalizePhotonFeature = (feature: PhotonFeature, index: number): PlaceResult | null => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return null;
    const props = feature.properties ?? {};

    const street = props.housenumber
        ? `${props.housenumber} ${props.street ?? ""}`.trim()
        : props.street ?? "";

    const displayParts = [
        props.name,
        street,
        props.district,
        props.locality,
        props.postcode,
        props.city,
        props.county,
        props.state,
        props.country,
    ].filter(Boolean);

    const displayName = displayParts.join(", ");
    const name = props.name || props.city || props.state || props.country || displayName;

    return {
        id: `${props.osm_type ?? "osm"}:${props.osm_id ?? index}`,
        name,
        displayName,
        latitude: coordinates[1],
        longitude: coordinates[0],
        category: props.osm_key && props.osm_value
            ? `${props.osm_key}:${props.osm_value}`
            : props.osm_key ?? undefined,
    };
};

export const searchPlaces = async (query: string): Promise<PlaceResult[]> => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return [];

    const params = new URLSearchParams({
        q: trimmed,
        lang: PHOTON_LANG,
        limit: String(RESULT_LIMIT),
    });
    const url = `${PHOTON_API_BASE_URL}?${params.toString()}`;

    let response: Response;
    try {
        response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (error) {
        logger.error("Photon request failed", { url, error: (error as Error).message });
        throw new InternalServerError("Place search failed");
    }

    if (!response.ok) {
        logger.error("Photon returned an error", { status: response.status, url });
        throw new InternalServerError("Place search failed");
    }

    const data = (await response.json()) as { features?: PhotonFeature[] };
    const features: PhotonFeature[] = Array.isArray(data?.features) ? data.features : [];

    return features
        .map(normalizePhotonFeature)
        .filter((place): place is PlaceResult => place !== null);
};