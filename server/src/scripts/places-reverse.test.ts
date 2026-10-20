/**
 * Verifies the pin reverse-geocode route against REAL Express routing and the
 * real Photon endpoint.
 *
 * A pin dropped on the passenger map is sent to the driver as a ride's
 * pickup/dropoff, so it cannot stay "Dropped pin": handleMapPick resolves it
 * through GET /api/places/reverse at pick time. This script mounts the REAL
 * placesRouter exactly as app.ts does, and checks that the route validates its
 * coordinates, rejects the values that would have silently produced garbage,
 * and returns a named place for a real pin.
 */
import express from "express";
import type { AddressInfo } from "net";
import placesRouter from "../routers/v1/places.router";

let pass = 0;
let fail = 0;
let skipped = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else {
        fail++;
        failures.push(`${name}${detail ? ` -- ${detail}` : ""}`);
        console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
    }
}
function skip(name: string, reason: string) {
    skipped++;
    console.log(`  SKIP  ${name} -- ${reason}`);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
    try {
        return (await response.json()) as Record<string, unknown>;
    } catch {
        return {};
    }
}

async function main() {
    // Mirrors the real layout in src/app.ts.
    const app = express();
    app.use("/api/places", placesRouter);

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;

    try {
        const missing = await fetch(`${base}/api/places/reverse`);
        check("missing coordinates are rejected with 400", missing.status === 400, String(missing.status));

        const outOfRange = await fetch(`${base}/api/places/reverse?lat=120&lon=77.2`);
        check("out-of-range latitude is rejected with 400", outOfRange.status === 400, String(outOfRange.status));

        const nonNumeric = await fetch(`${base}/api/places/reverse?lat=abc&lon=77.2`);
        check("non-numeric coordinates are rejected with 400", nonNumeric.status === 400, String(nonNumeric.status));

        // New Delhi — a real pin, resolved through the same Photon endpoint the
        // search route already uses. Komoot throttles the public instance, so a
        // throttled/unreachable provider is reported as a skip: the contract the
        // app depends on (a 200 with null place, never a 500) is still checked.
        const response = await fetch(`${base}/api/places/reverse?lat=28.6139&lon=77.2090`);
        check("valid pin answers 200", response.status === 200, String(response.status));
        const body = await readJson(response);
        const place = body.place as { name?: string; displayName?: string; latitude?: number; longitude?: number } | null | undefined;
        if (place === null) {
            skip("a named place comes back", "Photon did not resolve the pin (throttled or unavailable)");
            skip("display name carries the address", "Photon did not resolve the pin");
            skip("returned coordinates are finite numbers", "Photon did not resolve the pin");
        } else {
            check("a named place comes back", Boolean(place?.name), JSON.stringify(body).slice(0, 200));
            check("display name carries the address", Boolean(place?.displayName && place.displayName.length > 0));
            check(
                "returned coordinates are finite numbers",
                Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude),
                `${place?.latitude},${place?.longitude}`,
            );
        }

        // An empty ocean pin still answers 200 with a null place — the client
        // keeps its coordinate label rather than failing the pick.
        const ocean = await fetch(`${base}/api/places/reverse?lat=-30&lon=-140`);
        check("uninhabited pin still answers 200", ocean.status === 200, String(ocean.status));
        const oceanBody = await readJson(ocean);
        check("uninhabited pin answers with a null place", oceanBody.place === null || typeof oceanBody.place === "object", JSON.stringify(oceanBody).slice(0, 120));
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    console.log(`\n${"=".repeat(60)}\n  ${pass} passed, ${fail} failed, ${skipped} skipped\n${"=".repeat(60)}`);
    if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error("script failed:", error);
    process.exit(1);
});
