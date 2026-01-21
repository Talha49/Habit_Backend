const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const Territory = require('./models/v1/Territory');
const Category = require('./models/v1/Category');
const TerritoryLog = require('./models/v1/TerritoryLog');
const User = require('./models/v1/User');

const HEX_SIZE_LARGE = 0.009; // 1km

const getCellFromLocation = (lat, lng, resolution = 'LARGE') => {
    const size = HEX_SIZE_LARGE;
    const cellLat = Math.floor(lat / size);
    const cellLng = Math.floor(lng / size);
    return `${cellLat}_${cellLng}_L`;
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const userId = '694bd43504976488a750e428';
        const user = await User.findById(userId);

        if (!user) {
            console.error('❌ User not found:', userId);
            process.exit(1);
        }
        console.log('👤 Found User:', user.fullName);

        // Find Fitness Category
        const category = await Category.findOne({ name: 'Fitness' });
        if (!category) {
            console.error('❌ Fitness category not found');
            process.exit(1);
        }
        console.log('🏃 Found Category:', category.name);

        // Location: Islamabad F-10ish area (arbitrary central location)
        // Adjust slightly so it doesn't conflict with "my" current test location if I'm there?
        // Actually, user WANTS it to be there.
        // Use specific cell ID requested/observed
        const cellId = '3734_8117_L'; // Match the user's view
        console.log('📍 Using Cell ID:', cellId);

        // Delete existing if any (to be clean) or just update
        let territory = await Territory.findOne({ cellId });

        if (!territory) {
            territory = new Territory({
                cellId,
                // Approximate coords for this cell (reversed from grid logic roughly or just placeholders)
                // 3734 * 0.009 ~ 33.606, 8117 * 0.009 ~ 73.053
                coordinates: { type: 'Point', coordinates: [73.053, 33.606] }
            });
        }

        // Set to Locked
        const lockedDays = 7;
        const now = new Date();
        const lockedUntil = new Date(now);
        lockedUntil.setDate(now.getDate() + lockedDays);

        const fourDaysAgo = new Date(now);
        fourDaysAgo.setDate(now.getDate() - 4);

        territory.categoryId = category._id;
        territory.claimedBy = user._id;
        territory.status = 'locked';
        territory.lockedUntil = lockedUntil; // Future date
        territory.claimDate = fourDaysAgo; // "Over 3 days ago"
        territory.lastActivity = now;
        territory.activityCount = 50; // High activity

        await territory.save();

        // Create Log
        await TerritoryLog.create({
            territoryId: territory._id,
            userId: user._id,
            action: 'lock',
            details: 'Admin manually passed high streak lock'
        });

        console.log('🔒 Territory Locked Successfully!');
        console.log(`   - ID: ${territory._id}`);
        console.log(`   - Cell: ${cellId}`);
        console.log(`   - Owner: ${user.fullName}`);
        console.log(`   - Locked Until: ${lockedUntil.toISOString()}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected');
    }
};

run();
