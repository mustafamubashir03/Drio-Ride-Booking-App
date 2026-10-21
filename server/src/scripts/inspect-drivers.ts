import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI missing");
    await mongoose.connect(uri, { dbName: "Drio", serverSelectionTimeoutMS: 15000 });
    const db = mongoose.connection.db!;

    const users = (await db
        .collection("user")
        .find({})
        .project({
            name: 1, email: 1, role: 1, vehicleType: 1, vehicleName: 1, vehicleColor: 1,
            vehicleNumberPlate: 1, vehicleImage: 1,
        })
        .toArray()) as any[];

    const apps = await db.collection("driverapplications").find({}).toArray();

    const bookings = await db
        .collection("bookings")
        .find({})
        .project({ driver: 1, passenger: 1, status: 1 })
        .toArray() as any[];

    const driverIds = new Set<string>(
        bookings.map((b: any) => b.driver).filter(Boolean).map((d: any) => String(d))
    );

    console.log("=== USERS ===");
    for (const u of users) {
        const has = u.vehicleName && u.vehicleColor && u.vehicleNumberPlate && u.vehicleImage;
        const isDriverOnBooking = driverIds.has(String(u._id));
        console.log(
            `${u.email} | ${u.name} | role=${u.role ?? "-"} | vt=${u.vehicleType ?? "-"} | vehicle=${has ? "YES" : "NO"} | onBookingAsDriver=${isDriverOnBooking} | ${u.vehicleName ?? "-"} ${u.vehicleColor ?? "-"} ${u.vehicleNumberPlate ?? "-"} ${u.vehicleImage ?? "-"}`
        );
    }

    console.log("\n=== APPLICATIONS ===");
    for (const a of apps) {
        const u = users.find((x) => String(x._id) === String(a.user));
        const has = a.vehicleName && a.vehicleColor && a.vehicleNumberPlate && a.vehicleImage;
        console.log(
            `app ${a._id} | user=${u?.email ?? a.user} | status=${a.status} | vt=${a.vehicleType ?? "-"} | vehicle=${has ? "YES" : "NO"} | ${a.vehicleName ?? "-"} ${a.vehicleColor ?? "-"} ${a.vehicleNumberPlate ?? "-"} ${a.vehicleImage ?? "-"}`
        );
    }

    console.log("\n=== DRIVERS ON BOOKINGS (distinct) ===");
    for (const id of driverIds) {
        const u = users.find((x) => String(x._id) === id);
        console.log(`  ${u?.email ?? id} | role=${u?.role ?? "-"}`);
    }

    console.log("\n=== counts ===");
    console.log("users:", users.length, "apps:", apps.length, "bookings:", bookings.length);
    console.log("users missing full vehicle:", users.filter((u) => !(u.vehicleName && u.vehicleColor && u.vehicleNumberPlate && u.vehicleImage)).length);
    console.log("apps missing full vehicle:", apps.filter((a) => !(a.vehicleName && a.vehicleColor && a.vehicleNumberPlate && a.vehicleImage)).length);

    await mongoose.disconnect();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
