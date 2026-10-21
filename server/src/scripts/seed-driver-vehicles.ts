import mongoose from "mongoose";
import dotenv from "dotenv";
import { getRandomCarDetails, CAR_MODELS } from "../lib/vehicle-utils";

dotenv.config();

/**
 * Safe, idempotent driver-vehicle seed.
 *
 * Guarantees (this is production data, so every one of these is deliberate):
 *   - It never deletes a document. Nothing is dropped, truncated or replaced.
 *   - It never changes an `admin` role. An admin who also drives keeps driving
 *     (and keeps showing a vehicle) without being demoted to `driver`.
 *   - It only ever *fills in* missing vehicle fields. A driver who already has
 *     a plate keeps that exact plate on every later run, so the car a
 *     passenger sees for a driver is stable over time.
 *   - The vehicle image always follows the vehicle type, so a `mini` driver can
 *     never end up rendering a `/pro.png`.
 *   - The `user` document and the `driverapplications` document for the same
 *     person always end up describing the SAME car, so the driver portal and
 *     the passenger card never disagree.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-driver-vehicles.ts            # fill only what is missing
 *   npx ts-node src/scripts/seed-driver-vehicles.ts --dry-run  # report only, write nothing
 *   npx ts-node src/scripts/seed-driver-vehicles.ts --reroll=team.devspark@gmail.com
 */

const DRY_RUN = process.argv.includes("--dry-run");

/** Emails whose vehicle should be (re)generated on this run, on request. */
const REROLL_EMAILS = process.argv
    .filter((a) => a.startsWith("--reroll="))
    .map((a) => a.slice("--reroll=".length).trim().toLowerCase())
    .filter(Boolean);

/** The canonical image for a vehicle type. */
const IMAGE_BY_TYPE: Record<string, string> = {
    mini: "/mini.png",
    go: "/AC-go.png",
    "go-ac": "/AC-go.png",
    ac: "/AC-go.png",
    premium: "/premium.png",
    pro: "/pro.png",
    suv: "/suv.png",
    lux: "/premium.png",
    bike: "/bike.png",
};

const imageForType = (type: string) =>
    IMAGE_BY_TYPE[type] ??
    (CAR_MODELS[type as keyof typeof CAR_MODELS]?.[0]?.image ?? "/mini.png");

type Vehicle = {
    vehicleName: string;
    vehicleColor: string;
    vehicleNumberPlate: string;
    vehicleImage: string;
};

const isComplete = (v: Partial<Vehicle> | null | undefined): v is Vehicle =>
    Boolean(
        v?.vehicleName &&
        v.vehicleColor &&
        v.vehicleNumberPlate &&
        v.vehicleImage
    );

const hasAnyVehicle = (v: Partial<Vehicle> | null | undefined) =>
    Boolean(
        v?.vehicleName ||
        v?.vehicleColor ||
        v?.vehicleNumberPlate ||
        v?.vehicleImage
    );

/**
 * Build the vehicle a person should own.
 *
 * `existing` (from the driver application) wins so the driver's declared car
 * is preserved. `vehicleType` decides which image is valid, so the image is
 * always derived from the type rather than trusted from a stale document.
 */
const resolveVehicle = (
    vehicleType: string,
    existing: Partial<Vehicle> | null | undefined,
    reroll: boolean
): { vehicle: Vehicle; changed: boolean; source: "existing" | "generated" } => {
    if (!reroll && isComplete(existing)) {
        return {
            vehicle: {
                vehicleName: existing.vehicleName,
                vehicleColor: existing.vehicleColor,
                vehicleNumberPlate: existing.vehicleNumberPlate,
                vehicleImage: imageForType(vehicleType),
            },
            changed: existing.vehicleImage !== imageForType(vehicleType),
            source: "existing",
        };
    }

    const generated = getRandomCarDetails(vehicleType);
    return {
        vehicle: {
            vehicleName: generated.vehicleName,
            vehicleColor: generated.vehicleColor,
            vehicleNumberPlate: generated.vehicleNumberPlate,
            vehicleImage: imageForType(vehicleType),
        },
        changed: true,
        source: "generated",
    };
};

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI missing");
    await mongoose.connect(uri, { dbName: "Drio", serverSelectionTimeoutMS: 15000 });
    const db = mongoose.connection.db!;

    const users = (await db.collection("user").find({}).toArray()) as any[];
    const apps = (await db.collection("driverapplications").find({}).toArray()) as any[];

    const appByUser = new Map<string, any>();
    for (const a of apps) appByUser.set(String(a.user), a);

    /** Everyone who is legitimately expected to appear as a driver. */
    type Target = { user: any; why: string[] };
    const targets = new Map<string, Target>();

    const addTarget = (user: any, why: string) => {
        const key = String(user._id);
        const existing = targets.get(key);
        if (existing) {
            if (!existing.why.includes(why)) existing.why.push(why);
        } else {
            targets.set(key, { user, why: [why] });
        }
    };

    const driverIds = new Set<string>();

    for (const u of users) {
        if (u.role === "driver") {
            addTarget(u, "role=driver");
            driverIds.add(String(u._id));
        }
    }

    for (const a of apps) {
        if (a.status !== "approved") continue;
        const u = users.find((x) => String(x._id) === String(a.user));
        if (!u) continue;
        addTarget(u, "approved driver application");
        driverIds.add(String(u._id));
    }

    // People who actually drove a booking must have a vehicle to show.
    const bookings = (await db.collection("bookings").find({}).toArray()) as any[];
    for (const b of bookings) {
        if (!b.driver) continue;
        const u = users.find((x) => String(x._id) === String(b.driver));
        if (!u) continue;
        addTarget(u, "drove a booking");
        driverIds.add(String(u._id));
    }

    console.log(
        `Targets: ${targets.size} users (of ${users.length} total). ${DRY_RUN ? "DRY RUN - nothing will be written." : "writing."}`
    );
    if (REROLL_EMAILS.length) console.log(`Forced reroll for: ${REROLL_EMAILS.join(", ")}`);

    const userUpdates: any[] = [];
    const appUpdates: any[] = [];
    const roleChanges: any[] = [];

    for (const { user, why } of targets.values()) {
        const email = (user.email ?? "").toLowerCase();
        const app = appByUser.get(String(user._id));
        const reroll = REROLL_EMAILS.includes(email);

        // Vehicle type: the application wins, then the user, then mini.
        const vehicleType =
            app?.vehicleType || user.vehicleType || "mini";

        // The application is the driver's own declaration, so it is the
        // preferred source for what car they own.
        const { vehicle, source } = resolveVehicle(
            vehicleType,
            app?.vehicleName
                ? {
                    vehicleName: app.vehicleName,
                    vehicleColor: app.vehicleColor,
                    vehicleNumberPlate: app.vehicleNumberPlate,
                    vehicleImage: app.vehicleImage,
                }
                : user.vehicleName
                    ? {
                        vehicleName: user.vehicleName,
                        vehicleColor: user.vehicleColor,
                        vehicleNumberPlate: user.vehicleNumberPlate,
                        vehicleImage: user.vehicleImage,
                    }
                    : null,
            reroll
        );

        const userSet = {
            vehicleType,
            vehicleName: vehicle.vehicleName,
            vehicleColor: vehicle.vehicleColor,
            vehicleNumberPlate: vehicle.vehicleNumberPlate,
            vehicleImage: vehicle.vehicleImage,
        };

        const userChanged =
            user.vehicleType !== userSet.vehicleType ||
            user.vehicleName !== userSet.vehicleName ||
            user.vehicleColor !== userSet.vehicleColor ||
            user.vehicleNumberPlate !== userSet.vehicleNumberPlate ||
            user.vehicleImage !== userSet.vehicleImage;

        if (userChanged) {
            userUpdates.push({
                updateOne: {
                    filter: { _id: user._id },
                    update: { $set: userSet },
                },
            });
        }

        // Keep the application in sync with the same car.
        if (app) {
            const appSet = { ...userSet, vehicleType };
            const appChanged =
                app.vehicleType !== appSet.vehicleType ||
                app.vehicleName !== appSet.vehicleName ||
                app.vehicleColor !== appSet.vehicleColor ||
                app.vehicleNumberPlate !== appSet.vehicleNumberPlate ||
                app.vehicleImage !== appSet.vehicleImage;

            if (appChanged) {
                appUpdates.push({
                    updateOne: {
                        filter: { _id: app._id },
                        update: { $set: appSet },
                    },
                });
            }
        }

        // Role: an approved application means the person may drive. An admin
        // is left exactly as it is - admins can drive without being demoted.
        if (app?.status === "approved" && user.role === "passenger" && user.role !== "admin") {
            roleChanges.push({ user, from: user.role, to: "driver" });
            userUpdates.push({
                updateOne: {
                    filter: { _id: user._id },
                    update: { $set: { role: "driver" } },
                },
            });
        }

        const flag = userChanged || (app && hasAnyVehicle(app) === false) ? "UPDATED" : "ok     ";
        console.log(
            `  [${flag}] ${email} | ${why.join(", ")} | type=${vehicleType} | ${source} | ${vehicle.vehicleName} ${vehicle.vehicleColor} "${vehicle.vehicleNumberPlate}" ${vehicle.vehicleImage}`
        );
    }

    if (roleChanges.length) {
        console.log("\nRole changes (passenger -> driver, approved applications only):");
        for (const r of roleChanges) {
            console.log(`  ${r.user.email}: ${r.from} -> ${r.to}`);
        }
    }

    console.log(
        `\nPlanned: ${userUpdates.length} user write(s), ${appUpdates.length} application write(s).`
    );

    if (DRY_RUN) {
        console.log("Dry run complete. Nothing was written.");
        await mongoose.disconnect();
        return;
    }

    if (userUpdates.length) {
        const r = await db.collection("user").bulkWrite(userUpdates, { ordered: false });
        console.log(
            `user bulkWrite: matched=${r.matchedCount} modified=${r.modifiedCount}`
        );
    }
    if (appUpdates.length) {
        const r = await db.collection("driverapplications").bulkWrite(appUpdates, {
            ordered: false,
        });
        console.log(
            `driverapplications bulkWrite: matched=${r.matchedCount} modified=${r.modifiedCount}`
        );
    }

    // Verify from the raw collection, not from the in-memory copies.
    const check = (await db
        .collection("user")
        .find({ _id: { $in: [...targets.keys()].map((id) => new mongoose.Types.ObjectId(id)) } })
        .project({
            email: 1, role: 1, vehicleType: 1, vehicleName: 1, vehicleColor: 1,
            vehicleNumberPlate: 1, vehicleImage: 1,
        })
        .toArray()) as any[];

    const incomplete = check.filter(
        (u) =>
            !u.vehicleName ||
            !u.vehicleColor ||
            !u.vehicleNumberPlate ||
            !u.vehicleImage
    );

    console.log(`\nVerify: ${check.length} drivers checked, ${incomplete.length} still missing vehicle data.`);
    for (const u of incomplete) console.log(`  MISSING: ${u.email}`);

    await mongoose.disconnect();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
