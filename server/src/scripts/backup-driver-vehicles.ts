import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

/**
 * Snapshot the documents the seed script is allowed to touch, so a bad run
 * can be rolled back. Read-only: this never writes to Mongo.
 */
async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI missing");
    await mongoose.connect(uri, { dbName: "Drio", serverSelectionTimeoutMS: 15000 });
    const db = mongoose.connection.db!;

    const users = (await db.collection("user").find({}).toArray()) as any[];
    const apps = (await db.collection("driverapplications").find({}).toArray()) as any[];

    const driverIds = new Set<string>();
    for (const u of users) if (u.role === "driver") driverIds.add(String(u._id));
    for (const a of apps) if (a.status === "approved") driverIds.add(String(a.user));
    const bookings = (await db.collection("bookings").find({}).toArray()) as any[];
    for (const b of bookings) if (b.driver) driverIds.add(String(b.driver));

    const targetedUsers = users.filter((u) => driverIds.has(String(u._id)));
    const targetedApps = apps.filter((a) => driverIds.has(String(a.user)));

    const outDir = path.resolve(process.cwd(), "..", "backups");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(outDir, `driver-vehicles-${stamp}.json`);

    fs.writeFileSync(
        file,
        JSON.stringify(
            {
                takenAt: new Date().toISOString(),
                database: "Drio",
                note: "Pre-seed snapshot of every user/application the driver-vehicle seed may touch. Restore by $set-ing the listed fields.",
                users: targetedUsers.map((u) => ({
                    _id: u._id,
                    email: u.email,
                    name: u.name,
                    role: u.role,
                    vehicleType: u.vehicleType,
                    vehicleName: u.vehicleName,
                    vehicleColor: u.vehicleColor,
                    vehicleNumberPlate: u.vehicleNumberPlate,
                    vehicleImage: u.vehicleImage,
                })),
                applications: targetedApps.map((a) => ({
                    _id: a._id,
                    user: a.user,
                    status: a.status,
                    vehicleType: a.vehicleType,
                    vehicleName: a.vehicleName,
                    vehicleColor: a.vehicleColor,
                    vehicleNumberPlate: a.vehicleNumberPlate,
                    vehicleImage: a.vehicleImage,
                })),
            },
            null,
            2
        )
    );

    console.log(`Snapshot written: ${file}`);
    console.log(`  users: ${targetedUsers.length}, applications: ${targetedApps.length}`);

    await mongoose.disconnect();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
