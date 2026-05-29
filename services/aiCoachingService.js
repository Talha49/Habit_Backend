const Groq = require('groq-sdk');
const User = require('../models/v1/User');

// In-memory cache: first layer (same session, instant)
const memCache = {};
const MEM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// MongoDB cache: second layer (cross-session, saves API quota)
const DB_CACHE_TTL_HOURS = 12; // Regenerate insights every 12 hours

const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is missing from environment variables');
  return new Groq({ apiKey });
};

const buildHabitSummary = habits => habits.map(h => ({
  name: h.title,
  type: h.type,
  currentStreak: h.streak || 0,
  totalCompletions: h.totalCompletions || 0,
  frequency: h.frequency,
}));

/**
 * Wraps an LLM API call with exponential backoff.
 * If a 429 is received, waits and retries up to maxRetries times.
 */
const retryWithBackoff = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error.status === 429 || error.message?.includes('429');
      if (isRateLimit && i < maxRetries - 1) {
        const waitMs = Math.pow(2, i) * 2000; // 2s, 4s, 8s
        console.warn(`⏳ Quota hit. Retrying in ${waitMs / 1000}s... (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }
};

/**
 * Analyzes user habit data and generates coaching insights.
 * Cache layers:
 *   1. In-memory (10 min) — same session, zero latency
 *   2. MongoDB (12 hr)    — cross-session, no API call needed
 *   3. Live Groq API      — with exponential backoff retry
 */
exports.generateInsights = async (user, habits, options = {}) => {
  const userId = user._id.toString();
  const { forceFresh = false } = options;

  if (!forceFresh) {
    // --- Layer 1: In-memory cache ---
    const mem = memCache[userId];
    if (mem && mem.expiresAt > Date.now()) {
      console.log('🤖 [Cache L1] Returning in-memory insights for user:', userId);
      return mem.data;
    }

    // --- Layer 2: MongoDB cache ---
    const dbCacheExpiry = new Date(Date.now() - DB_CACHE_TTL_HOURS * 60 * 60 * 1000);
    if (user.aiInsightsCache && user.aiInsightsCachedAt && user.aiInsightsCachedAt > dbCacheExpiry) {
      console.log('🤖 [Cache L2] Returning MongoDB-cached insights for user:', userId);
      // Refresh in-memory cache from DB cache
      memCache[userId] = { data: user.aiInsightsCache, expiresAt: Date.now() + MEM_CACHE_TTL_MS };
      return user.aiInsightsCache;
    }
  }

  // --- Layer 3: Live Groq API call with retry ---
  try {
    const groq = getGroqClient();

    const habitSummary = buildHabitSummary(habits);

    const prompt = `You are a proactive, motivational AI Habit Coach for a gamified habit tracking app.
Analyze the following user data:
User Name: ${user.fullName}
User Level: ${user.level} (Total XP: ${user.totalXP})
Active Habits: ${JSON.stringify(habitSummary)}

Provide a response as a raw JSON object (no markdown code blocks) with this exact structure:
{
  "widgetMessage": "A short punchy sentence (max 15 words). Show a Risk Prevention Alert if any streak is 0, otherwise a Motivational Suggestion.",
  "performanceReport": "2-3 sentences analyzing their current habit performance and streaks.",
  "growthInsights": "2-3 sentences about what they are doing well and where to improve.",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2", "Specific suggestion 3"]
}`;

    console.log('🤖 [API] Requesting fresh insights from Groq...');
    const completion = await retryWithBackoff(() =>
      groq.chat.completions.create({
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a proactive, motivational AI Habit Coach. Return only valid JSON matching the requested schema.',
          },
          { role: 'user', content: prompt },
        ],
      })
    );
    const responseText = completion.choices?.[0]?.message?.content || '';

    // Strip markdown code fences if present
    const cleanJson = responseText.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const insights = JSON.parse(cleanJson);

    // Persist to MongoDB cache
    await User.findByIdAndUpdate(userId, {
      aiInsightsCache: insights,
      aiInsightsCachedAt: new Date(),
    });

    // Store in memory cache
    memCache[userId] = { data: insights, expiresAt: Date.now() + MEM_CACHE_TTL_MS };

    console.log('✅ Insights generated and cached successfully.');
    return insights;

  } catch (error) {
    console.error('❌ AI Coaching Service Error:', error.message);

    // Fallback: return stale DB cache if available, rather than crashing
    if (user.aiInsightsCache) {
      console.log('⚠️ Returning stale cached insights as fallback.');
      return user.aiInsightsCache;
    }

    console.log('⚠️ Quota exhausted and no cache available. Returning mock insights for development.');
    return {
      widgetMessage: "Stay consistent! Every small step counts towards your big goals.",
      performanceReport: "You are doing well with your active habits. Keep building those streaks to see long-term results.",
      growthInsights: "Consistency is key. Focus on maintaining your daily check-ins to build momentum.",
      suggestions: [
        "Try to check in at the same time every day.",
        "Don't worry if you miss a day, just start again.",
        "Set smaller, achievable goals if you feel overwhelmed."
      ]
    };
  }
};

// Clears both cache layers for a user (e.g., when new habits are added)
exports.clearCache = async (userId) => {
  delete memCache[userId.toString()];
  await User.findByIdAndUpdate(userId, {
    aiInsightsCache: null,
    aiInsightsCachedAt: null,
  });
};

exports.chatWithCoach = async (user, habits, message, history = []) => {
  const groq = getGroqClient();
  const habitSummary = buildHabitSummary(habits);
  const safeHistory = Array.isArray(history) ? history.slice(-8) : [];

  const historyMessages = safeHistory
    .filter(item => item && typeof item.role === 'string' && typeof item.content === 'string')
    .map(item => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content.slice(0, 800),
    }));

  const completion = await retryWithBackoff(() =>
    groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content:
            'You are a warm, practical habit coach. Be supportive but direct. Keep replies concise (2-5 sentences), ask clarifying follow-up questions when useful, and give concrete next actions.',
        },
        {
          role: 'system',
          content: `User profile: Name ${user.fullName}, Level ${user.level}, Total XP ${user.totalXP}. Active habits: ${JSON.stringify(habitSummary)}`,
        },
        ...historyMessages,
        { role: 'user', content: message.slice(0, 1200) },
      ],
    })
  );

  return completion.choices?.[0]?.message?.content?.trim()
    || 'You are doing better than you think. Let us pick one small action for today and execute it.';
};
