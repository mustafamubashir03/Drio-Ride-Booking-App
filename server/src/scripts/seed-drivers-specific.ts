import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user.model';
import DriverApplicationModel from '../models/driver-application.model';
import { getRandomCarDetails } from '../lib/vehicle-utils';

dotenv.config();

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI missing');
    await mongoose.connect(uri);

    const mustafa = await User.findOne({ email: 'mustafamubashir87@gmail.com' });
    if (mustafa) {
        mustafa.role = 'driver';
        const carDetails = getRandomCarDetails('mini');
        mustafa.vehicleType = 'mini';
        mustafa.vehicleName = carDetails.vehicleName;
        mustafa.vehicleColor = carDetails.vehicleColor;
        mustafa.vehicleNumberPlate = carDetails.vehicleNumberPlate;
        mustafa.vehicleImage = carDetails.vehicleImage;
        await mustafa.save();
        console.log('Updated mustafa driver:', mustafa.email, carDetails);
    } else {
        console.log('mustafamubashir87@gmail.com not found');
    }

    const saif = await User.findOne({ email: /saifullah/i }) || await User.findOne({ name: /saifullah/i });
    if (saif) {
        saif.role = 'driver';
        const carDetails = getRandomCarDetails('bike');
        saif.vehicleType = 'bike';
        saif.vehicleName = carDetails.vehicleName;
        saif.vehicleColor = carDetails.vehicleColor;
        saif.vehicleNumberPlate = carDetails.vehicleNumberPlate;
        saif.vehicleImage = carDetails.vehicleImage;
        await saif.save();
        console.log('Updated saifullah:', (saif as any).email, carDetails);
    } else {
        console.log('saifullah not found');
    }

    const apps = await DriverApplicationModel.find().populate('user');
    for (const app of apps) {
        const user: any = app.user;
        if (!user?.email) continue;
        if (user.email === 'mustafamubashir87@gmail.com') {
            const carDetails = getRandomCarDetails('mini');
            app.vehicleType = 'mini';
            app.status = 'approved';
            app.vehicleName = carDetails.vehicleName;
            app.vehicleColor = carDetails.vehicleColor;
            app.vehicleNumberPlate = carDetails.vehicleNumberPlate;
            app.vehicleImage = carDetails.vehicleImage;
            await app.save();
            console.log('Updated application for mustafa:', carDetails);
        } else if (/saifullah/i.test(user.email) || /saifullah/i.test(user.name || '')) {
            const carDetails = getRandomCarDetails('bike');
            app.vehicleType = 'bike';
            app.status = 'approved';
            app.vehicleName = carDetails.vehicleName;
            app.vehicleColor = carDetails.vehicleColor;
            app.vehicleNumberPlate = carDetails.vehicleNumberPlate;
            app.vehicleImage = carDetails.vehicleImage;
            await app.save();
            console.log('Updated application for saifullah:', carDetails);
        } else {
            const carDetails = getRandomCarDetails(app.vehicleType || 'mini');
            app.vehicleName = carDetails.vehicleName;
            app.vehicleColor = carDetails.vehicleColor;
            app.vehicleNumberPlate = carDetails.vehicleNumberPlate;
            app.vehicleImage = carDetails.vehicleImage;
            await app.save();
            console.log(`Updated application for ${user.email} (${app.vehicleType}):`, carDetails);
        }
    }

    // Update all existing drivers with vehicle details
    const allDrivers = await User.find({ role: 'driver' });
    for (const driver of allDrivers) {
        if (!driver.vehicleName || !driver.vehicleColor || !driver.vehicleNumberPlate) {
            const carDetails = getRandomCarDetails(driver.vehicleType || 'mini');
            driver.vehicleName = carDetails.vehicleName;
            driver.vehicleColor = carDetails.vehicleColor;
            driver.vehicleNumberPlate = carDetails.vehicleNumberPlate;
            driver.vehicleImage = carDetails.vehicleImage;
            await driver.save();
            console.log(`Updated driver ${driver.email} with random car:`, carDetails);
        }
    }

    await mongoose.disconnect();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});