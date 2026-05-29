const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/v1/User');
const Habit = require('../models/v1/Habit');
const CoachNotification = require('../models/v1/CoachNotification');
const aiCoachingService = require('../services/aiCoachingService');
const coachAgentService = require('../services/coachAgentService');

const USER_ID = '69ef9871e2233cdd35cc0959';

async function triggerHighRiskAlert() {
  try {
    console.log(`🚀 Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    
    let user = await User.findById(USER_ID);
    if (!user) {
      console.log(`❌ User not found!`);
      process.exit(1);
    }
    
    // 1. Find the user's habit
    let habit = await Habit.findOne({ userId: user._id, isActive: true });
    if (!habit) {
      console.log(`❌ No active habits found for Anas!`);
      process.exit(1);
    }

    console.log(`\n🎯 Modifying habit: "${habit.title}"`);
    
    // 2. Set to 7 days streak, but make it "about to break" (completed 26 hours ago)
    habit.streak = 7;
    habit.totalCompletions = 7;
    
    // We set it to 26 hours ago so the system thinks they missed today's check-in
    habit.lastCompletedAt = new Date(Date.now() - (26 * 60 * 60 * 1000)); 
    await habit.save();
    console.log(`✅ Habit streak set to 7. Last check-in artificially delayed to 26 hours ago.`);

    // 3. Clear previous notifications so we can generate fresh ones without cooldown blocking us
    await CoachNotification.deleteMany({ userId: user._id, habitId: habit._id });
    console.log(`🧹 Cleared notification cooldowns.`);

    // 4. Temporarily hack the risk score function if we really need it to hit the "Risk Alert" threshold (70+)
    // The current formula gives 50 points for being >24 hours late. We'll adjust the database or just let it generate the natural "Reminder" alert. 
    // Wait, let's just generate the notifications natively to see what it does.
    
    console.log(`\n🔔 Generating Proactive Coach Notifications...`);
    const notifications = await coachAgentService.generateCoachNotificationsForUser(user._id);
    
    // 5. Clear AI cache to update the widget message
    await aiCoachingService.clearCache(user._id);
    console.log(`\n🤖 Requesting fresh AI Coach insights from Groq...`);
    const insights = await aiCoachingService.generateInsights(user, [habit], { forceFresh: true });

    console.log(`\n=================== COACH ALERTS ===================`);
    if (notifications.length > 0) {
      notifications.forEach(n => {
        console.log(`🚨 [TYPE: ${n.type.toUpperCase()}]`);
        console.log(`   Title: ${n.title}`);
        console.log(`   Message: ${n.message}`);
        console.log(`   Calculated Risk Score: ${n.riskScore}/100`);
      });
    } else {
      console.log(`⚠️ No notifications generated.`);
    }

    console.log(`\n=================== AI WIDGET ===================`);
    console.log(`Widget Message: "${insights.widgetMessage}"`);

    console.log(`\n🎉 Done! Open the app to see your new 7-day streak and your coach's urgent warnings!`);
    process.exit(0);

  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

triggerHighRiskAlert();
