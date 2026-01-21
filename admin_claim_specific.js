const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const Territory = require('./models/v1/Territory');
const Category = require('./models/v1/Category');
const TerritoryLog = require('./models/v1/TerritoryLog');
const User = require('./models/v1/User');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const userId = '694bd43504976488a750e428'; // Awais
        const user = await User.findById(userId);

        if (!user) {
            console.error('❌ User not found');
            process.exit(1);
        }

        // Find Fitness Category
        const category = await Category.findOne({ name: 'Fitness' });
        if (!category) {
            console.error('❌ Fitness category not found');
            process.exit(1);
        }

        const cellId = '3734_8117_L';
        const lat = 33.610287;
        const lng = 73.057445;

        // Delete existing if any (to be clean) or just update
        let territory = await Territory.findOne({ cellId });

        if (!territory) {
            territory = new Territory({
                cellId,
                coordinates: { type: 'Point', coordinates: [lng, lat] }
            });
        }

        // Set to LOCKED (For verification)
        const lockedUntil = new Date();
        lockedUntil.setDate(lockedUntil.getDate() + 7); // Lock for 7 days

        territory.categoryId = category._id;
        territory.claimedBy = user._id;
        territory.status = 'locked';
        territory.lockedUntil = lockedUntil;
        territory.claimDate = new Date();
        territory.lastActivity = new Date();
        territory.activityCount = 50; // High activity implies strong defense

        await territory.save();

        // Create Log
        await TerritoryLog.create({
            territoryId: territory._id,
            userId: user._id,
            action: 'lock',
            details: 'Admin manually locked territory for testing'
        });

        console.log('🔒 Territory Locked Successfully!');
        console.log(`   - ID: ${territory._id}`);
        console.log(`   - Cell: ${cellId}`);
        console.log(`   - Owner: ${user.fullName}`);
        console.log(`   - Status: ${territory.status}`);
        console.log(`   - Locked Until: ${lockedUntil}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected');
    }
};

run();
