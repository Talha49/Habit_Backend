const {
  registerUser,
  registerWithOTP,
  loginUser,
  requestOTP,
  verifyOTP,
  forgotPassword,
  resetPassword,
  createLinkInvite,
  acceptLinkInvite,
  revokeLink,
  listUserLinks,
  sanitizeUser,
} = require('../../services/v1/authService');

exports.register = async (req, res) => {
  console.log('Register API hit', req.body);
  try {
    const { fullName, phone, email, password, professional, role } = req.body;
    const result = await registerWithOTP({ fullName, phone, email, password, professional, role });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.login = async (req, res) => {
  console.log('🔐 Login API hit with body:', { email: req.body.email, password: '***' });
  try {
    const { email, password } = req.body;
    const userAgent = req.get('user-agent');
    const { user, tokens } = await loginUser({ email, password, userAgent });
    console.log('✅ Login successful for user:', user.email);
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user,
      tokens
    });
  } catch (err) {
    console.error('❌ Login failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.requestOTP = async (req, res) => {
  console.log('📧 Request OTP API hit for email:', req.body.email);
  try {
    const { email, purpose } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const result = await requestOTP(email, purpose || 'login');
    console.log('✅ OTP sent successfully to:', email);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('❌ Request OTP failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.verifyOTP = async (req, res) => {
  console.log('🔍 Verify OTP API hit for email:', req.body.email);
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
    const result = await verifyOTP(email, otp);
    console.log('✅ OTP verified successfully for user:', email);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('❌ Verify OTP failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  console.log('🔑 Forgot Password API hit for email:', req.body.email);
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const result = await forgotPassword(email);
    console.log('✅ Forgot password request processed for:', email);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('❌ Forgot password failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  console.log('🔄 Reset Password API hit for email:', req.body.email);
  try {
    const { email, newPassword, resetToken } = req.body;
    if (!email || !newPassword || !resetToken) {
      return res.status(400).json({ error: 'Email, reset token, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    const userAgent = req.get('user-agent');
    const result = await resetPassword({ email, newPassword, resetToken, userAgent });
    console.log('✅ Password reset successfully for:', email);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('❌ Reset password failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.createLinkInvite = async (req, res) => {
  console.log('🧩 Create Link Invite API hit:', req.body);
  try {
    const { userId, linkType, expiresInMinutes } = req.body;
    if (!userId || !linkType) {
      return res.status(400).json({ success: false, error: 'User ID and link type are required' });
    }
    const invite = await createLinkInvite({ initiatorId: userId, linkType, expiresInMinutes });
    res.status(201).json({ success: true, invite });
  } catch (err) {
    console.error('❌ Create link invite failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.acceptLinkInvite = async (req, res) => {
  console.log('🤝 Accept Link Invite API hit:', req.body);
  try {
    const { inviteCode, userId } = req.body;
    if (!inviteCode || !userId) {
      return res.status(400).json({ success: false, error: 'Invite code and user ID are required' });
    }
    const link = await acceptLinkInvite({ inviteCode, userId });
    res.status(200).json({ success: true, link });
  } catch (err) {
    console.error('❌ Accept link invite failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.revokeLink = async (req, res) => {
  console.log('🛑 Revoke Link API hit:', req.body);
  try {
    const { linkId, userId } = req.body;
    if (!linkId || !userId) {
      return res.status(400).json({ success: false, error: 'Link ID and user ID are required' });
    }
    const link = await revokeLink({ linkId, requesterId: userId });
    res.status(200).json({ success: true, link });
  } catch (err) {
    console.error('❌ Revoke link failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.listLinks = async (req, res) => {
  console.log('📋 List Links API hit:', req.query);
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }
    const links = await listUserLinks(userId);
    res.status(200).json({ success: true, links });
  } catch (err) {
    console.error('❌ List links failed:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

const buildClerkProfile = (clerkUser) => {
  if (!clerkUser) {
    return null;
  }

  const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress || null;

  return {
    id: clerkUser.id,
    email: primaryEmail,
    firstName: clerkUser.firstName || null,
    lastName: clerkUser.lastName || null,
    imageUrl: clerkUser.imageUrl || null,
  };
};

exports.getCurrentUser = async (req, res) => {
  try {
    if (req.clerkLinkedUser) {
      return res.status(200).json({
        success: true,
        source: 'clerk',
        user: sanitizeUser(req.clerkLinkedUser),
        clerk: buildClerkProfile(req.clerkUser),
        linkMeta: {
          matchType: req.clerkLinkMatchType || null,
          wasLinked: Boolean(req.clerkLinkWasLinked),
          wasCreated: Boolean(req.clerkLinkWasCreated),
        },
      });
    }

    return res.status(401).json({ success: false, error: 'Not authenticated' });
  } catch (error) {
    console.error('❌ getCurrentUser failed:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load session user' });
  }
};

exports.updatePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.clerkLinkedUser ? req.clerkLinkedUser._id : (req.user ? req.user._id : null);
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const User = require('../../models/v1/User');
    await User.findByIdAndUpdate(userId, { expoPushToken: token });

    res.json({ success: true, message: 'Push token updated successfully' });
  } catch (err) {
    console.error('❌ updatePushToken failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
