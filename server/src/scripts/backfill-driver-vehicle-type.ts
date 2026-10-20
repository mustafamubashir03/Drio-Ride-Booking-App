import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model";
import DriverApplicationModel from "../models/driver-application.model";

dotenv.config();

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error("MONGODB_URI missing");
    await mongoose.connect(uri);
    
    const userRes = await User.updateMany(
        { role: "driver", $or: [{ vehicleType: { $exists: false } }, { vehicleType: null }, { vehicleType: "" }] },
        { $set: { vehicleType: "mini" } }
    );
    console.log("Updated driver users without vehicleType:", userRes.modifiedCount);
    
    const appRes = await DriverApplicationModel.updateMany(
        { status: "approved", $or: [{ vehicleType: { $exists: false } }, { vehicleType: null }, { vehicleType: "" }] },
        { $set: { vehicleType: "mini" } }
    );
    console.log("Updated approved driver applications without vehicleType:", appRes.modifiedCount);
    
    const appRes2 = await DriverApplicationModel.updateMany(
        { $or: [{ vehicleType: { $exists: false } }, { vehicleType: null }, { vehicleType: "" }] },
        { $set: { vehicleType: "mini" } }
    );
    console.log("Updated all driver applications missing vehicleType:", appRes2.modifiedCount);
    
    await mongoose.disconnect();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
