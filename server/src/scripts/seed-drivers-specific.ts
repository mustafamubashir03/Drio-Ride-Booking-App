import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user.model';
import DriverApplicationModel from '../models/driver-application.model';

dotenv.config();

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI missing');
    await mongoose.connect(uri);

    const mustafa = await User.findOne({ email: 'mustafamubashir87@gmail.com' });
    if (mustafa) {
        mustafa.role = 'driver';
        (mustafa as any).vehicleType = 'mini';
        (mustafa as any).vehicleName = 'Toyota Corolla Altis';
        (mustafa as any).vehicleColor = 'White';
        (mustafa as any).vehicleNumberPlate = 'ABC-1234';
        (mustafa as any).vehicleImage = '/mini.png';
        await mustafa.save();
        console.log('Updated mustafa driver:', mustafa.email);
    } else {
        console.log('mustafamubashir87@gmail.com not found');
    }

    const saif = await User.findOne({ email: /saifullah/i }) || await User.findOne({ name: /saifullah/i });
    if (saif) {
        saif.role = 'driver';
        (saif as any).vehicleType = 'bike';
        (saif as any).vehicleName = 'Honda CB125F';
        (saif as any).vehicleColor = 'Red';
        (saif as any).vehicleNumberPlate = 'BIKE-5678';
        (saif as any).vehicleImage = '/bike.png';
        await saif.save();
        console.log('Updated saifullah:', (saif as any).email);
    } else {
        console.log('saifullah not found');
    }

    const apps = await DriverApplicationModel.find().populate('user');
    for (const app of apps) {
        const user: any = app.user;
        if (!user?.email) continue;
        if (user.email === 'mustafamubashir87@gmail.com') {
            app.vehicleType = 'mini';
            (app as any).status = 'approved';
            (app as any).vehicleName = 'Toyota Corolla Altis';
            (app as any).vehicleColor = 'White';
            (app as any).vehicleNumberPlate = 'ABC-1234';
            (app as any).vehicleImage = '/mini.png';
            await app.save();
            console.log('Updated application for mustafa');
        } else if (/saifullah/i.test(user.email) || /saifullah/i.test(user.name || '')) {
            app.vehicleType = 'bike';
            (app as any).status = 'approved';
            (app as any).vehicleName = 'Honda CB125F';
            (app as any).vehicleColor = 'Red';
            (app as any).vehicleNumberPlate = 'BIKE-5678';
            (app as any).vehicleImage = '/bike.png';
            await app.save();
            console.log('Updated application for saifullah');
        }
    }

    await mongoose.disconnect();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
