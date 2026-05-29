const Squad = require('../../models/v1/Squad');
const User = require('../../models/v1/User');
const Category = require('../../models/v1/Category');

// Generate a random 6-character uppercase invite code
const generateInviteCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// POST /v1/squads — Create a new squad
exports.createSquad = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, description, categoryId } = req.body;

    if (!name || !categoryId) {
      return res.status(400).json({ success: false, error: 'Name and category are required.' });
    }

    // Check user is not already in a squad
    const existingUser = await User.findById(userId);
    if (existingUser.squadId) {
      return res.status(400).json({ success: false, error: 'You are already in a squad. Leave it first.' });
    }

    // Validate category
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found.' });
    }

    // Ensure invite code is unique
    let inviteCode;
    let isUnique = false;
    while (!isUnique) {
      inviteCode = generateInviteCode();
      const existing = await Squad.findOne({ inviteCode });
      if (!existing) isUnique = true;
    }

    const squad = await Squad.create({
      name: name.trim(),
      description: description?.trim() || '',
      categoryId,
      createdBy: userId,
      members: [userId],
      inviteCode,
    });

    // Link squad to user
    await User.findByIdAndUpdate(userId, { squadId: squad._id });

    const populated = await Squad.findById(squad._id)
      .populate('categoryId', 'name color icon')
      .populate('members', 'fullName totalXP level');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'A squad with this name already exists.' });
    }
    console.error('❌ Create squad error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// POST /v1/squads/join — Join a squad via invite code
exports.joinSquad = async (req, res) => {
  try {
    const userId = req.user._id;
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ success: false, error: 'Invite code is required.' });
    }

    const user = await User.findById(userId);
    if (user.squadId) {
      return res.status(400).json({ success: false, error: 'You are already in a squad. Leave it first.' });
    }

    const squad = await Squad.findOne({ inviteCode: inviteCode.toUpperCase().trim(), isActive: true });
    if (!squad) {
      return res.status(404).json({ success: false, error: 'Invalid invite code or squad not found.' });
    }

    if (squad.members.length >= 10) {
      return res.status(400).json({ success: false, error: 'This squad is full (max 10 members).' });
    }

    if (squad.members.some(m => m.toString() === userId.toString())) {
      return res.status(400).json({ success: false, error: 'You are already a member of this squad.' });
    }

    squad.members.push(userId);
    await squad.save();
    await User.findByIdAndUpdate(userId, { squadId: squad._id });

    const populated = await Squad.findById(squad._id)
      .populate('categoryId', 'name color icon')
      .populate('members', 'fullName totalXP level');

    res.status(200).json({ success: true, data: populated });
  } catch (error) {
    console.error('❌ Join squad error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// POST /v1/squads/leave — Leave current squad
exports.leaveSquad = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user.squadId) {
      return res.status(400).json({ success: false, error: 'You are not in a squad.' });
    }

    const squad = await Squad.findById(user.squadId);
    if (!squad) {
      await User.findByIdAndUpdate(userId, { squadId: null });
      return res.status(200).json({ success: true, message: 'Left squad (squad not found).' });
    }

    // Remove member
    squad.members = squad.members.filter(m => m.toString() !== userId.toString());

    if (squad.members.length === 0) {
      // Delete the squad if no members remain
      await Squad.findByIdAndDelete(squad._id);
    } else {
      // If creator left, transfer ownership to first remaining member
      if (squad.createdBy.toString() === userId.toString()) {
        squad.createdBy = squad.members[0];
      }
      await squad.save();
    }

    await User.findByIdAndUpdate(userId, { squadId: null });

    res.status(200).json({ success: true, message: 'Successfully left the squad.' });
  } catch (error) {
    console.error('❌ Leave squad error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET /v1/squads/me — Get current user's squad
exports.getMySquad = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user.squadId) {
      return res.status(200).json({ success: true, data: null });
    }

    const squad = await Squad.findById(user.squadId)
      .populate('categoryId', 'name color icon')
      .populate('members', 'fullName totalXP level');

    if (!squad) {
      await User.findByIdAndUpdate(userId, { squadId: null });
      return res.status(200).json({ success: true, data: null });
    }

    // Attach each member's individual contribution from the contributions map
    const squadObj = squad.toObject();
    squadObj.members = squadObj.members.map(member => ({
      ...member,
      squadContribution: squad.contributions.get(member._id.toString()) || 0
    }));

    res.status(200).json({ success: true, data: squadObj });
  } catch (error) {
    console.error('❌ Get my squad error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET /v1/squads/leaderboard?categoryId=... — Competitive leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const { categoryId } = req.query;

    const filter = { isActive: true };
    if (categoryId) filter.categoryId = categoryId;

    const squads = await Squad.find(filter)
      .sort({ totalXP: -1 })
      .limit(20)
      .populate('categoryId', 'name color icon')
      .populate('members', 'fullName totalXP level');

    res.status(200).json({ success: true, data: squads });
  } catch (error) {
    console.error('❌ Squad leaderboard error:', error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
