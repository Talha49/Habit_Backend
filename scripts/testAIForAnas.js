const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/v1/User');
const Habit = require('../models/v1/Habit');
const Category = require('../models/v1/Category');
const aiCoachingService = require('../services/aiCoachingService');
const coachAgentService = require('../services/coachAgentService');

const USER_ID = '69ef9871e2233cdd35cc0959';

async function runAIModuleForAnas() {
  try {
    console.log(`🚀 Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected to MongoDB.`);

    // 1. Get User
    let user = await User.findById(USER_ID);
    if (!user) {
      console.log(`⚠️ User ${USER_ID} not found. Creating mock user Anas...`);
      user = await User.create({
        _id: USER_ID,
        fullName: 'Anas',
        email: 'anas.test@example.com',
        clerkId: 'user_mock_anas_123',
        level: 5,
        totalXP: 1200,
        aiConsent: true
      });
    } else {
      user.aiConsent = true;
      await user.save();
      console.log(`✅ Found user: ${user.fullName}`);
    }

    // 2. Clear old cache
    console.log(`🧹 Clearing previous AI Cache for Anas...`);
    await aiCoachingService.clearCache(user._id);

    // 3. Ensure Habits exist to analyze
    let habits = await Habit.find({ userId: user._id, isActive: true });
    if (habits.length === 0) {
      console.log(`⚠️ No active habits found. Creating mock habits to analyze...`);
      const category = await Category.findOne() || { _id: new mongoose.Types.ObjectId() };
      
      const newHabits = await Habit.insertMany([
        {
          userId: user._id,
          title: 'Daily Coding Practice',
          type: 'building',
          categoryId: category._id,
          streak: 14, // High streak for Motivational feedback
          totalCompletions: 20,
          isActive: true,
          lastCompletedAt: new Date()
        },
        {
          userId: user._id,
          title: 'Morning Jog',
          type: 'building',
          categoryId: category._id,
          streak: 0, // 0 Streak + old lastCompletedAt for Risk Prevention Alert
          totalCompletions: 3,
          isActive: true,
          lastCompletedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) // 2 days ago
        }
      ]);
      habits = newHabits;
      console.log(`✅ Created ${habits.length} mock habits.`);
    }

    // 4. Generate AI Insights (User data analysis, Motivational feedback, Personalized suggestions)
    console.log(`\n🤖 Requesting AI Analysis from Groq...`);
    const insights = await aiCoachingService.generateInsights(user, habits, { forceFresh: true });
    console.log(`\n=================== AI INSIGHTS ===================`);
    console.log(JSON.stringify(insights, null, 2));
    
    // 5. Generate Coach Notifications (Risk prevention alerts)
    console.log(`\n🔔 Running Risk Prevention & Alert Sweep...`);
    const notifications = await coachAgentService.generateCoachNotificationsForUser(user._id);
    console.log(`✅ Created ${notifications.length} Risk Prevention Alerts/Reminders.`);
    notifications.forEach(n => console.log(`   -> [${n.type.toUpperCase()}] ${n.title}: ${n.message}`));

    console.log(`\n🎉 Module fully implemented and tested for Anas! You can now check the Coach UI in the app.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

runAIModuleForAnas();
