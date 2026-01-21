const User = require('../models/v1/User');
const Badge = require('../models/v1/Badge');
const UserBadge = require('../models/v1/UserBadge');
const HabitLog = require('../models/v1/HabitLog');
const Territory = require('../models/v1/Territory');

// Leveling Curve: Level = floor(sqrt(totalXP / 10))
// 0 XP = Lvl 0
// 100 XP = Lvl 3 (roughly) - Lets adjust
// Linear-ish curve might be better for MVP:
// Level = 1 + floor(totalXP / 100)
const calculateLevel = (xp) => {
    return 1 + Math.floor(xp / 100);
};

exports.addXP = async (userId, amount, categoryId = null) => {
    try {
        const user = await User.findById(userId);
        if (!user) return null;

        user.totalXP = (user.totalXP || 0) + amount;
        user.currentXP = (user.currentXP || 0) + amount;

        // Category XP Logic
        if (categoryId) {
            const catKey = categoryId.toString();
            // Assuming categoryXP is initialized. If using Mongoose Map:
            const currentCatXP = user.categoryXP ? (user.categoryXP.get(catKey) || 0) : 0;
            if (!user.categoryXP) user.categoryXP = new Map();
            user.categoryXP.set(catKey, currentCatXP + amount);
        }

        // Check Level Up
        const newLevel = calculateLevel(user.totalXP);
        let levelUp = false;

        if (newLevel > user.level) {
            user.level = newLevel;
            levelUp = true;
            console.log(`🎉 User ${user.email} leveled up to ${newLevel}!`);
        }

        await user.save();
        return { user, levelUp, newLevel };
    } catch (error) {
        console.error('❌ addXP failed:', error);
        return null;
    }
};

exports.checkBadges = async (userId, actionType, currentValue) => {
    try {
        // 1. Find potential badges for this trigger type
        const possibleBadges = await Badge.find({
            triggerType: actionType,
            triggerValue: { $lte: currentValue }
        });

        if (!possibleBadges.length) return [];

        const newBadges = [];

        // 2. Check which ones user already has
        for (const badge of possibleBadges) {
            const alreadyEarned = await UserBadge.exists({ userId, badgeId: badge._id });
            if (!alreadyEarned) {
                await UserBadge.create({ userId, badgeId: badge._id });

                // Award XP for badge?
                if (badge.xpReward) {
                    await exports.addXP(userId, badge.xpReward);
                }

                newBadges.push(badge);
                console.log(`🏆 User earned badge: ${badge.name}`);
            }
        }

        return newBadges;
    } catch (error) {
        console.error('❌ checkBadges failed:', error);
        return [];
    }
};

// Helper to seed initial badges if none exist
exports.seedBadges = async () => {
    const count = await Badge.countDocuments();
    if (count === 0) {
        console.log('🌱 Seeding Badges...');
        const badges = [
            { name: 'First Step', description: 'Complete your first habit check-in.', icon: 'footsteps', triggerType: 'habit_count', triggerValue: 1, xpReward: 50 },
            { name: 'Consistent', description: 'Reach a 3-day streak.', icon: 'flame', triggerType: 'streak', triggerValue: 3, xpReward: 100 },
            { name: 'On Fire', description: 'Reach a 7-day streak.', icon: 'bonfire', triggerType: 'streak', triggerValue: 7, xpReward: 250 },
            { name: 'Explorer', description: 'Claim your first territory.', icon: 'flag', triggerType: 'territory_count', triggerValue: 1, xpReward: 100 },
            { name: 'Conqueror', description: 'Claim 5 territories.', icon: 'earth', triggerType: 'territory_count', triggerValue: 5, xpReward: 300 },
        ];
        await Badge.insertMany(badges);
        console.log('✅ Badges seeded.');
    }
};
