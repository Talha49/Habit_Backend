const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Territory = require('./models/v1/Territory');
const TerritoryLog = require('./models/v1/TerritoryLog');

const DECAY_DAYS = 7;

const runDecayTest = async () => {
    try {
        console.log('🔌 Connecting to DB...');
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI is missing from environment variables');
        }
        await mongoose.connect(uri);
        console.log('✅ Connected.');

        // 1. Find a candidate territory or create a dummy one
        let territory = await Territory.findOne({ status: 'claimed' });

        if (!territory) {
            console.log('⚠️ No claimed territories found to test. Please claim one in the app first!');
            // Optional: Create one if needed, but better to use real data
            process.exit(0);
        }

        console.log(`🎯 Targeted Territory: ${territory._id} (Owner: ${territory.claimedBy})`);
        console.log(`   Current Last Activity: ${territory.lastActivity}`);

        // 2. Artificially age it
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - (DECAY_DAYS + 1)); // 8 days ago
        territory.lastActivity = oldDate;
        await territory.save();
        console.log(`⌛ Artificially aged territory to: ${oldDate.toISOString()}`);

        // 3. Run Decay Logic (Copied from CronService)
        console.log('🚀 Running Decay Logic...');
        const decayThreshold = new Date();
        decayThreshold.setDate(decayThreshold.getDate() - DECAY_DAYS);

        const territoriesToDecay = await Territory.find({
            status: { $in: ['claimed', 'locked'] },
            lastActivity: { $lt: decayThreshold }
        });

        console.log(`📋 Found ${territoriesToDecay.length} territories meeting decay criteria.`);

        for (const t of territoriesToDecay) {
            if (t._id.equals(territory._id)) {
                const oldOwner = t.claimedBy;
                t.status = 'unclaimed';
                t.claimedBy = null;
                t.claimDate = null;
                t.lockedUntil = null;
                t.lastActivity = new Date();
                await t.save();

                if (oldOwner) {
                    await TerritoryLog.create({
                        territoryId: t._id,
                        userId: oldOwner,
                        action: 'decay',
                        details: `TEST DECAY: Inactive for ${DECAY_DAYS}+ days`
                    });
                }
                console.log(`✅ Territory ${t._id} successfully decayed!`);
            }
        }

        // 4. Verify
        const updatedT = await Territory.findById(territory._id);
        console.log(`🔎 Verification: Status is now '${updatedT.status}'`);

    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Done.');
        process.exit(0);
    }
};

runDecayTest();
