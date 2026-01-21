const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/v1/User');
const Territory = require('../models/v1/Territory');
const TerritoryLog = require('../models/v1/TerritoryLog');
const Habit = require('../models/v1/Habit');
const UserLink = require('../models/v1/UserLink');
const Category = require('../models/v1/Category');

dotenv.config();

const runVerification = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to DB');

        // 1. Setup Test Data
        const testUser = await User.findOneAndUpdate(
            { email: 'test_user_verify@example.com' },
            { fullName: 'Test User', password: 'hashedpassword', professional: 'None', role: 'standard', phone: '9999999991' },
            { upsert: true, new: true }
        );

        const testDoctor = await User.findOneAndUpdate(
            { email: 'test_doctor_verify@example.com' },
            { fullName: 'Dr. Test', password: 'hashedpassword', professional: 'Doctor', role: 'doctor', phone: '9999999992' },
            { upsert: true, new: true }
        );

        const category = await Category.findOne();
        if (!category) throw new Error('No categories found');

        // 2. Test Territory Logging
        console.log('🧪 Testing Territory Logging...');
        const territory = await Territory.findOneAndUpdate(
            { cellId: '8928308280fffff' },
            {
                categoryId: category._id,
                claimedBy: testUser._id,
                status: 'claimed',
                lastActivity: new Date(),
                coordinates: { type: 'Point', coordinates: [0, 0] }
            },
            { upsert: true, new: true }
        );

        // Simulate Log Creation (normally done by controller)
        await TerritoryLog.create({
            territoryId: territory._id,
            userId: testUser._id,
            action: 'claim',
            details: 'Manual verification claim'
        });

        const log = await TerritoryLog.findOne({ territoryId: territory._id });
        if (log && log.action === 'claim') {
            console.log('✅ Territory Log created successfully');
        } else {
            console.error('❌ Territory Log failed');
        }

        // 3. Test Decay Logic
        console.log('🧪 Testing Decay Logic...');
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 8); // 8 days ago

        await Territory.updateOne(
            { _id: territory._id },
            { lastActivity: oldDate }
        );

        // Manually run decay logic snippet
        const decayThreshold = new Date();
        decayThreshold.setDate(decayThreshold.getDate() - 7);

        const toDecay = await Territory.findOne({
            _id: territory._id,
            lastActivity: { $lt: decayThreshold }
        });

        if (toDecay) {
            console.log('✅ Decay Logic: Territory identified for decay');
        } else {
            console.error('❌ Decay Logic: Territory NOT identified (Check dates)');
        }

        // 4. Test User Link (Doctor)
        console.log('🧪 Testing Doctor Link...');
        await UserLink.create({
            initiator: testDoctor._id,
            linkedUser: testUser._id,
            linkType: 'doctor-patient',
            status: 'active',
            inviteCode: 'CHK123'
        });

        const linkedPatients = await UserLink.find({ initiator: testDoctor._id, status: 'active' });
        if (linkedPatients.length > 0) {
            console.log('✅ Doctor Link active found');
        } else {
            console.error('❌ Doctor Link failed');
        }

        // Cleanup
        await UserLink.deleteMany({ inviteCode: 'CHK123' });
        await Territory.deleteOne({ cellId: '8928308280fffff' });
        await TerritoryLog.deleteMany({ details: 'Manual verification claim' });
        await User.deleteOne({ _id: testUser._id });
        await User.deleteOne({ _id: testDoctor._id });

        console.log('🏁 Verification Complete');
        process.exit(0);

    } catch (err) {
        console.error('❌ Verification Failed:', err);
        process.exit(1);
    }
};

runVerification();
