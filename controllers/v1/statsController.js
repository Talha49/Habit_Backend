const Habit = require('../../models/v1/Habit');
const User = require('../../models/v1/User');
const Category = require('../../models/v1/Category');

exports.getDashboardSummary = async (req, res) => {
    console.log('📊 Get Dashboard Summary API hit');
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        // 1. Habit Stats
        const habits = await Habit.find({ userId, isActive: true });
        const totalHabits = habits.length;
        const perfectStreaks = habits.filter(h => h.streak >= 7).length; // Habits with 7+ day streaks

        // 2. Badges
        const UserBadge = require('../../models/v1/UserBadge');
        const userBadges = await UserBadge.find({ userId }).populate('badgeId');
        const badges = userBadges.map(ub => ({
            ...ub.badgeId.toObject(),
            earnedAt: ub.earnedAt
        }));

        // 3. Category Breakdown (Full List)
        const categoryBreakdown = [];
        let bestCategory = null;
        let bestCategoryDetails = null;
        let maxXP = -1;

        if (user.categoryXP && user.categoryXP.size > 0) {
            // Get all category IDs
            const categoryIds = Array.from(user.categoryXP.keys());
            const categories = await Category.find({ _id: { $in: categoryIds } });

            // Map categories to map for easy lookup
            const catMap = new Map(categories.map(c => [c._id.toString(), c]));

            for (let [catId, xp] of user.categoryXP) {
                const catDetails = catMap.get(catId);
                if (catDetails) {
                    categoryBreakdown.push({
                        id: catId,
                        name: catDetails.name,
                        color: catDetails.color,
                        icon: catDetails.icon,
                        xp: xp
                    });

                    if (xp > maxXP) {
                        maxXP = xp;
                        bestCategory = catId;
                        bestCategoryDetails = catDetails;
                    }
                }
            }

            // Sort by XP desc
            categoryBreakdown.sort((a, b) => b.xp - a.xp);
        }

        // 4. Next Level Progress
        // Level N requires N*100 XP (Linear) or N^2 * 10 (Quad) -> Using Linear: Level 1 = 0-99, Lvl 2 = 100-199
        // XP to next level = (Level) * 100 - currentXP? 
        // Formula used in addXP: Level = 1 + floor(totalXP / 100)
        // So Next Level Threshold = user.level * 100
        const nextLevelThreshold = user.level * 100;
        const xpToNextLevel = nextLevelThreshold - user.totalXP;

        res.status(200).json({
            success: true,
            data: {
                level: user.level,
                totalXP: user.totalXP,
                currentXP: user.currentXP,
                xpProgress: {
                    current: user.totalXP,
                    nextLevelThreshold,
                    toNext: Math.max(0, xpToNextLevel),
                    percent: Math.min(100, Math.floor((user.totalXP % 100) / 100 * 100)) // Simplified based on linear 100 steps
                },
                habitStats: {
                    total: totalHabits,
                    perfectStreaks
                },
                bestCategory: bestCategoryDetails ? {
                    ...bestCategoryDetails.toObject(),
                    xp: maxXP
                } : null,
                categoryBreakdown,
                badges
            }
        });

    } catch (err) {
        console.error('❌ Get stats failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getPerformanceReport = async (req, res) => {
    try {
        const userId = req.user.id;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const habits = await Habit.find({ userId, isActive: true });
        
        // Fetch validation logs from the last 30 days
        const ValidationLog = require('../../models/v1/ValidationLog');
        const logs = await ValidationLog.find({
            userId,
            createdAt: { $gte: thirtyDaysAgo }
        });

        // Compute completion rates
        let totalLogs = logs.length;
        let passedLogs = logs.filter(l => l.status === 'passed').length;
        let completionRate = totalLogs > 0 ? (passedLogs / totalLogs) * 100 : 0;

        // Group by day for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const last7DaysLogs = logs.filter(l => l.createdAt >= sevenDaysAgo);
        
        // A simple daily breakdown
        const dailyData = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dailyData[d.toISOString().split('T')[0]] = 0;
        }

        last7DaysLogs.forEach(log => {
            if (log.status === 'passed') {
                const dateKey = log.createdAt.toISOString().split('T')[0];
                if (dailyData[dateKey] !== undefined) {
                    dailyData[dateKey] += 1;
                }
            }
        });

        const chartData = Object.keys(dailyData).map(date => ({
            date,
            count: dailyData[date]
        }));

        res.status(200).json({
            success: true,
            data: {
                completionRate: completionRate.toFixed(1),
                totalCheckIns: totalLogs,
                passedCheckIns: passedLogs,
                chartData,
                habitsOverview: habits.map(h => ({ id: h._id, title: h.title, streak: h.streak }))
            }
        });

    } catch (err) {
        console.error('❌ Get report failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.exportUserData = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const user = await User.findById(userId).select('-password');
        const habits = await Habit.find({ userId });
        
        const ValidationLog = require('../../models/v1/ValidationLog');
        const validationLogs = await ValidationLog.find({ userId }).sort({ createdAt: -1 });

        const Squad = require('../../models/v1/Squad');
        const squads = await Squad.find({ members: userId });

        const exportData = {
            profile: user,
            habits,
            validationLogs,
            squads
        };

        res.status(200).json({
            success: true,
            data: exportData
        });

    } catch (err) {
        console.error('❌ Export data failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
