const Habit = require('../../models/v1/Habit');
const HabitLog = require('../../models/v1/HabitLog');
const mongoose = require('mongoose');
const User = require('../../models/v1/User');
const Squad = require('../../models/v1/Squad');

// Helper to get start of day in UTC to compare dates roughly
// For production, this should ideally accept a timezone from the client
const isSameDay = (d1, d2) => {
    return d1.toISOString().split('T')[0] === d2.toISOString().split('T')[0];
};

const getDiffDays = (d1, d2) => {
    const date1 = new Date(d1.toISOString().split('T')[0]);
    const date2 = new Date(d2.toISOString().split('T')[0]);
    const diffTime = Math.abs(date1 - date2);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Create a new habit
exports.createHabit = async (req, res) => {
    console.log('📝 Create Habit API hit');
    try {
        const { title, description, categoryId, frequency } = req.body;
        const userId = req.user.id; // From auth middleware

        if (!title || !categoryId) {
            return res.status(400).json({ success: false, error: 'Title and Category are required' });
        }

        const habit = new Habit({
            userId,
            title,
            description,
            categoryId,
            frequency: frequency || 'daily'
        });

        await habit.save();

        console.log(`✅ Habit created: ${habit.title}`);
        res.status(201).json({ success: true, data: habit });
    } catch (err) {
        console.error('❌ Create habit failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get user's habits with today's completion status
exports.getHabits = async (req, res) => {
    console.log('📋 Get Habits API hit');
    try {
        const userId = req.user.id;
        const habits = await Habit.find({ userId, isActive: true })
            .populate('categoryId', 'name color icon')
            .sort({ createdAt: -1 });

        const now = new Date();

        // Map to add "completedToday" flag
        const habitsWithStatus = habits.map(habit => {
            const isCompletedToday = habit.lastCompletedAt && isSameDay(habit.lastCompletedAt, now);
            return {
                ...habit.toObject(),
                completedToday: !!isCompletedToday
            };
        });

        res.status(200).json({ success: true, data: habitsWithStatus });
    } catch (err) {
        console.error('❌ Get habits failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Check-in (Complete) a habit
exports.checkIn = async (req, res) => {
    console.log('✅ Check-in API hit');
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const now    = new Date();

        // Accept anti-cheat payload from client
        const { gpsData, timerData } = req.body;

        const habit = await Habit.findOne({ _id: id, userId });

        if (!habit) {
            return res.status(404).json({ success: false, error: 'Habit not found' });
        }

        // Idempotency: Check if already completed today
        if (habit.lastCompletedAt && isSameDay(habit.lastCompletedAt, now)) {
            return res.status(400).json({ success: false, error: 'Habit already completed today' });
        }

        // Streak Calculation
        let newStreak = habit.streak;

        if (!habit.lastCompletedAt) {
            newStreak = 1;
        } else {
            const diff = getDiffDays(now, habit.lastCompletedAt);
            if (diff === 1) {
                newStreak += 1;
            } else if (diff > 1) {
                newStreak = 1;
            }
        }

        // Update stats
        habit.streak = newStreak;
        if (newStreak > habit.bestStreak) habit.bestStreak = newStreak;
        habit.totalCompletions += 1;
        habit.lastCompletedAt  = now;
        await habit.save();

        // Create HabitLog (initially pending)
        const habitLog = await HabitLog.create({
            habitId:   habit._id,
            userId,
            completedAt: now,
            gpsData:    gpsData   || undefined,
            timerData:  timerData || undefined,
        });

        // ── ANTI-CHEAT VALIDATION ──────────────────────────────────────────────
        let validationSummary = {};
        let finalStatus       = 'pending';
        try {
            const antiCheat = require('../../services/antiCheatService');
            const result = await antiCheat.runValidation({
                userId,
                habit,
                habitLogId: habitLog._id,
                gpsData,
                timerData,
                now,
            });
            finalStatus       = result.finalStatus;      // 'verified' | 'flagged'
            validationSummary = result.validationSummary;

            // Persist the final status back onto the log
            habitLog.validationStatus = finalStatus;
            await habitLog.save();
        } catch (acErr) {
            console.warn('⚠️ Anti-cheat validation error (non-critical):', acErr.message);
        }
        // ──────────────────────────────────────────────────────────────────────

        // GAMIFICATION REWARDS  (only grant XP for verified/pending logs, NOT flagged)
        const gamificationService = require('../../services/gamificationService');
        const XP_PER_CHECKIN = 10;
        let xpResult, newBadges, squadXPAwarded = false;

        if (finalStatus !== 'flagged') {
            xpResult  = await gamificationService.addXP(userId, XP_PER_CHECKIN, habit.categoryId);
            newBadges = await gamificationService.checkBadges(userId, 'streak', newStreak);

            // SQUAD CONTRIBUTION
            try {
                const user = await User.findById(userId).select('squadId');
                if (user?.squadId) {
                    const squad = await Squad.findById(user.squadId).select('categoryId totalXP contributions');
                    if (squad && squad.categoryId.toString() === habit.categoryId.toString()) {
                        squad.totalXP += XP_PER_CHECKIN;
                        const prevContrib = squad.contributions.get(userId.toString()) || 0;
                        squad.contributions.set(userId.toString(), prevContrib + XP_PER_CHECKIN);
                        await squad.save();
                        squadXPAwarded = true;
                        console.log(`🏆 Squad XP +${XP_PER_CHECKIN}. Member contrib: ${prevContrib + XP_PER_CHECKIN}`);
                    }
                }
            } catch (squadErr) {
                console.warn('⚠️ Squad XP update failed (non-critical):', squadErr.message);
            }
        } else {
            console.warn(`🚨 Flagged check-in for habit "${habit.title}" by user ${userId}. XP withheld.`);
        }

        console.log(`✅ Check-in [${finalStatus.toUpperCase()}] for: ${habit.title}. Streak: ${newStreak}`);

        res.status(200).json({
            success: true,
            data: {
                ...habit.toObject(),
                completedToday: true,
            },
            validation: {
                status: finalStatus,
                summary: validationSummary,
            },
            rewards: finalStatus !== 'flagged' ? {
                xpEarned:      XP_PER_CHECKIN,
                newLevel:      xpResult?.levelUp ? xpResult.newLevel : null,
                newBadges:     newBadges,
                squadXPAwarded,
            } : { xpEarned: 0, message: 'XP withheld – validation flagged' },
        });

    } catch (err) {
        console.error('❌ Check-in failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};


// Undo Check-in (Optional, for accidental clicks)
exports.undoCheckIn = async (req, res) => {
    // Logic: Remove last log, revert streaks. 
    // Complex because we don't store "previous streak". 
    // For now, let's keep it simple: just remove log and decrement count, 
    // but keeping streak accurate is hard without history.
    // Skipping for MVP unless requested.
    res.status(501).json({ success: false, error: 'Not implemented yet' });
};

// Delete a habit
exports.deleteHabit = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Soft delete
        const habit = await Habit.findOneAndUpdate(
            { _id: id, userId },
            { isActive: false },
            { new: true }
        );

        if (!habit) {
            return res.status(404).json({ success: false, error: 'Habit not found' });
        }

        res.status(200).json({ success: true, message: 'Habit deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
