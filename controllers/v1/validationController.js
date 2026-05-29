const ValidationLog = require('../../models/v1/ValidationLog');
const HabitLog      = require('../../models/v1/HabitLog');

// GET /v1/validation/my-logs  – flagged entries for current user
exports.getMyValidationLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, limit = 20 } = req.query;

    const query = { userId };
    if (status) query.status = status;

    const logs = await ValidationLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('habitId', 'title')
      .lean();

    return res.status(200).json({ success: true, data: logs });
  } catch (err) {
    console.error('❌ getMyValidationLogs:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch validation logs' });
  }
};

// GET /v1/validation/stats  – summary counts for the current user
exports.getValidationStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [total, flaggedLogs, verifiedLogs] = await Promise.all([
      HabitLog.countDocuments({ userId }),
      HabitLog.countDocuments({ userId, validationStatus: 'flagged' }),
      HabitLog.countDocuments({ userId, validationStatus: 'verified' }),
    ]);

    const integrityScore = total > 0 ? Math.round((verifiedLogs / total) * 100) : 100;

    return res.status(200).json({
      success: true,
      data: {
        totalCheckIns: total,
        verified: verifiedLogs,
        flagged: flaggedLogs,
        pending: total - flaggedLogs - verifiedLogs,
        integrityScore, // 0–100 %
      },
    });
  } catch (err) {
    console.error('❌ getValidationStats:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

// GET /v1/validation/flagged  – admin: all flagged check-ins across all users
exports.getAllFlaggedLogs = async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const logs = await ValidationLog.find({ status: 'flagged' })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId',  'fullName email')
      .populate('habitId', 'title')
      .lean();

    return res.status(200).json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    console.error('❌ getAllFlaggedLogs:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch flagged logs' });
  }
};
