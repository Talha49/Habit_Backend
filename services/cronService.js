const cron = require('node-cron');
const Territory = require('../models/v1/Territory');
const TerritoryLog = require('../models/v1/TerritoryLog');
const { runCoachNotificationSweep } = require('./coachAgentService');

const DECAY_DAYS = 7;

exports.initCronJobs = () => {
    console.log('⏰ Initializing Cron Jobs...');

    // Run every day at midnight: '0 0 * * *'
    cron.schedule('0 0 * * *', async () => {
        console.log('⏳ Running Territory Decay Job...');
        try {
            const decayThreshold = new Date();
            decayThreshold.setDate(decayThreshold.getDate() - DECAY_DAYS);

            // Find territories that are claimed/locked BUT inactivity > 7 days
            // and NOT immune (future feature?)
            const territoriesToDecay = await Territory.find({
                status: { $in: ['claimed', 'locked'] },
                lastActivity: { $lt: decayThreshold }
            });

            if (territoriesToDecay.length === 0) {
                console.log('✅ No territories to decay.');
                return;
            }

            console.log(`⚠️  Found ${territoriesToDecay.length} territories to decay.`);

            for (const territory of territoriesToDecay) {
                const oldOwner = territory.claimedBy;

                // Reset Logic
                territory.status = 'unclaimed';
                territory.claimedBy = null;
                territory.claimDate = null;
                territory.lockedUntil = null;
                territory.lastActivity = new Date(); // Reset timestamp so it doesn't get picked up again immediately? 
                // Or keep it? If we set status to unclaimed, query won't pick it up.

                await territory.save();

                // Log it
                if (oldOwner) {
                    await TerritoryLog.create({
                        territoryId: territory._id,
                        userId: oldOwner,
                        action: 'decay',
                        details: `Inactive for ${DECAY_DAYS}+ days`
                    });
                }
            }

            console.log(`♻️  Decayed ${territoriesToDecay.length} territories.`);

        } catch (error) {
            console.error('❌ Territory Decay Job Failed:', error);
        }
    });

    // Run every hour for proactive AI coach reminders.
    cron.schedule('0 * * * *', async () => {
        console.log('🤖 Running Coach Notification Sweep...');
        try {
            const result = await runCoachNotificationSweep();
            console.log(
                `✅ Coach sweep done. Users scanned: ${result.usersScanned}, notifications created: ${result.notificationsCreated}`
            );
        } catch (error) {
            console.error('❌ Coach Notification Sweep Failed:', error.message);
        }
    });
};
