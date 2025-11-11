const User = require('../../models/v1/User');
const UserLink = require('../../models/v1/UserLink');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config');

const ROLE_OPTIONS = ['child', 'parent', 'doctor', 'standard'];
const OTP_EXPIRY_MINUTES = Number(config.OTP_EXPIRY_MINUTES || 10);
const OTP_COOLDOWN_SECONDS = Number(config.OTP_COOLDOWN_SECONDS || 60);
const PASSWORD_RESET_EXPIRY_MINUTES = Number(config.PASSWORD_RESET_EXPIRY_MINUTES || 30);
const ACCESS_TOKEN_EXPIRY = config.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_TOKEN_DAYS = Number(config.JWT_REFRESH_DAYS || 30);
const MAX_REFRESH_TOKENS = Number(config.JWT_REFRESH_LIMIT || 5);
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000;

function normalizeRole(role) {
  if (role && ROLE_OPTIONS.includes(role)) {
    return role;
  }
  return 'standard';
}

function sanitizeUser(user) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : user;
  return {
    id: obj._id,
    fullName: obj.fullName,
    phone: obj.phone,
    email: obj.email,
    professional: obj.professional,
    role: obj.role,
    isVerified: obj.isVerified,
    verifiedAt: obj.verifiedAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function pruneRefreshTokens(tokens = []) {
  const now = Date.now();
  return tokens
    .filter(token => token && token.expiresAt && token.expiresAt.getTime() > now)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_REFRESH_TOKENS);
}

async function issueTokens(user, { userAgent } = {}) {
  const payload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role
  };

  const accessToken = jwt.sign(payload, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

  const refreshToken = crypto.randomBytes(48).toString('hex');
  const refreshTokenHash = hashToken(refreshToken);
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const existingTokens = pruneRefreshTokens(user.refreshTokens || []);
  existingTokens.unshift({
    tokenHash: refreshTokenHash,
    userAgent: userAgent || null,
    createdAt: new Date(),
    expiresAt: refreshTokenExpiresAt
  });

  user.refreshTokens = existingTokens.slice(0, MAX_REFRESH_TOKENS);
  await user.save({ validateBeforeSave: false });

  return {
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRY,
    refreshToken,
    refreshTokenExpiresAt
  };
}

async function registerUser({ fullName, phone, email, password, professional, role }) {
  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    throw new Error('User already exists with this email or phone');
  }

  const hashed = await bcrypt.hash(password, 10);
  const otp = generateOTP();
  const now = Date.now();

  const user = new User({
    fullName,
    phone,
    email,
    password: hashed,
    professional,
    role: normalizeRole(role),
    otp,
    otpExpiry: new Date(now + OTP_TTL_MS),
    otpCooldown: new Date(now),
    isVerified: false,
    verificationMethod: null,
    verifiedAt: null
  });

  await user.save();
  sendOTPEmail(email, otp, 'registration').catch(err => {
    console.error('Failed to send OTP email:', err);
  });

  return { message: 'Registration initiated. Please verify your email with OTP.' };
}

async function registerWithOTP(params) {
  return registerUser(params);
}

async function loginUser({ email, password, userAgent }) {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('Email not registered. Please check your email or sign up for a new account.');
  }

  if (user.loginAttempts >= 5) {
    const elapsed = Date.now() - (user.lastLoginAttempt?.getTime() || 0);
    if (elapsed < 15 * 60 * 1000) {
      throw new Error('Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.');
    }
    user.loginAttempts = 0;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    user.loginAttempts += 1;
    user.lastLoginAttempt = new Date();
    await user.save({ validateBeforeSave: false });
    throw new Error('Incorrect password. Please try again.');
  }

  if (!user.isVerified) {
    throw new Error('Please verify your email first. Check your email for OTP verification.');
  }

  user.loginAttempts = 0;
  user.lastLoginAttempt = null;
  await user.save({ validateBeforeSave: false });

  const tokens = await issueTokens(user, { userAgent });
  return {
    user: sanitizeUser(user),
    tokens
  };
}

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function createTransporter() {
  console.log('📧 Creating email transporter with user:', config.EMAIL_USER ? '***@gmail.com' : 'NOT SET');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_PASS
    },
    secure: true,
    tls: {
      rejectUnauthorized: false
    }
  });
}

async function sendOTPEmail(email, otp, type = 'registration') {
  try {
    const transporter = createTransporter();
    let subject;
    let title;
    let message;
    let action;

    switch (type) {
      case 'password reset':
        subject = 'Reset Your Password - Habit App';
        title = 'Reset Your Password';
        message = 'You requested a password reset. Your One-Time Password (OTP) is:';
        action = 'Enter this code in the app to reset your password.';
        break;
      case 'login':
        subject = 'Login Verification - Habit App';
        title = 'Verify Your Login';
        message = 'To complete your login, use this One-Time Password (OTP):';
        action = 'Enter this code in the app to complete your login.';
        break;
      default:
        subject = 'Verify Your Email - Habit App Registration';
        title = 'Welcome to Habit App!';
        message = 'Thank you for registering. Your One-Time Password (OTP) for email verification is:';
        action = 'Enter this code in the app to complete your registration.';
    }

    const mailOptions = {
      from: config.EMAIL_USER,
      to: email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${title}</h2>
          <p>${message}</p>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p style="color: #666;">This OTP will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p style="color: #666;">${action}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">This is an automated message from Habit App. Please do not reply.</p>
        </div>
      `
    };

    console.log(`📧 Sending ${type} OTP email to:`, email);
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ ${type} OTP email sent successfully to:`, email);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send ${type} OTP email:`, error.message);
    throw new Error(`Email service error: ${error.message}`);
  }
}

async function requestOTP(email, type = 'login') {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('User not found');
  }

  if (user.otpCooldown) {
    const elapsed = Date.now() - user.otpCooldown.getTime();
    if (elapsed < OTP_COOLDOWN_SECONDS * 1000) {
      const remaining = Math.ceil((OTP_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
      throw new Error(`Please wait ${remaining} seconds before requesting another OTP`);
    }
  }

  const otp = generateOTP();
  const now = Date.now();

  user.otp = otp;
  user.otpExpiry = new Date(now + OTP_TTL_MS);
  user.otpCooldown = new Date(now);
  await user.save({ validateBeforeSave: false });

  sendOTPEmail(email, otp, type).catch(err => {
    console.error('Failed to send OTP email:', err);
  });

  return { message: 'OTP sent successfully' };
}

async function verifyOTP(email, otp) {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.otp || !user.otpExpiry) {
    throw new Error('No OTP found. Please request a new OTP');
  }

  if (Date.now() > user.otpExpiry.getTime()) {
    user.otp = null;
    user.otpExpiry = null;
    await user.save({ validateBeforeSave: false });
    throw new Error('OTP has expired. Please request a new OTP');
  }

  if (user.otp !== otp) {
    throw new Error('Invalid OTP');
  }

  user.otp = null;
  user.otpExpiry = null;
  user.otpCooldown = null;

  if (user.resetInProgress) {
    const passwordResetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = hashToken(passwordResetToken);
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save({ validateBeforeSave: false });

    return {
      success: true,
      isPasswordReset: true,
      passwordResetToken,
      user: sanitizeUser(user)
    };
  }

  user.isVerified = true;
  user.verificationMethod = 'otp';
  user.verifiedAt = user.verifiedAt || new Date();
  user.loginAttempts = 0;
  user.lastLoginAttempt = null;
  await user.save({ validateBeforeSave: false });

  const tokens = await issueTokens(user);

  return {
    success: true,
    user: sanitizeUser(user),
    tokens
  };
}

async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('Email not found. Please check your email address or sign up for a new account.');
  }

  if (user.otpCooldown) {
    const elapsed = Date.now() - user.otpCooldown.getTime();
    if (elapsed < OTP_COOLDOWN_SECONDS * 1000) {
      const remaining = Math.ceil((OTP_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
      throw new Error(`Please wait ${remaining} seconds before requesting another OTP.`);
    }
  }

  const otp = generateOTP();
  const now = Date.now();

  user.otp = otp;
  user.otpExpiry = new Date(now + OTP_TTL_MS);
  user.otpCooldown = new Date(now);
  user.resetInProgress = true;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save({ validateBeforeSave: false });

  sendOTPEmail(email, otp, 'password reset').catch(err => {
    console.error('Failed to send password reset OTP email:', err);
  });

  return { message: 'Password reset code sent to your email. Please check your inbox.' };
}

async function resetPassword({ email, newPassword, resetToken, userAgent }) {
  if (!resetToken) {
    throw new Error('Reset token is required');
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.resetInProgress || !user.passwordResetToken || !user.passwordResetExpires) {
    throw new Error('Password reset session not found or already completed');
  }

  if (Date.now() > user.passwordResetExpires.getTime()) {
    user.resetInProgress = false;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save({ validateBeforeSave: false });
    throw new Error('Password reset token has expired. Please request a new reset.');
  }

  const providedHash = hashToken(resetToken);
  if (providedHash !== user.passwordResetToken) {
    throw new Error('Invalid password reset token');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  user.resetInProgress = false;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  user.isVerified = true;
  user.verificationMethod = user.verificationMethod || 'otp';
  user.verifiedAt = user.verifiedAt || new Date();
  await user.save({ validateBeforeSave: false });

  const tokens = await issueTokens(user, { userAgent });

  return {
    message: 'Password reset successfully',
    user: sanitizeUser(user),
    tokens
  };
}

async function generateLinkCode() {
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const existing = await UserLink.findOne({ inviteCode: code });
  if (existing) {
    return generateLinkCode();
  }
  return code;
}

async function createLinkInvite({ initiatorId, linkType, expiresInMinutes = 60 }) {
  if (!['parent-child', 'doctor-patient'].includes(linkType)) {
    throw new Error('Invalid link type');
  }

  const initiator = await User.findById(initiatorId);
  if (!initiator) {
    throw new Error('Initiator not found');
  }

  if (linkType === 'parent-child' && initiator.role !== 'parent') {
    throw new Error('Only parent accounts can create parent-child invites');
  }

  if (linkType === 'doctor-patient' && initiator.role !== 'doctor') {
    throw new Error('Only doctor accounts can create doctor-patient invites');
  }

  const inviteCode = await generateLinkCode();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const link = await UserLink.create({
    linkType,
    initiator: initiator._id,
    inviteCode,
    status: 'pending',
    expiresAt
  });

  return serializeLink(link);
}

async function acceptLinkInvite({ inviteCode, userId }) {
  const link = await UserLink.findOne({ inviteCode: inviteCode.toUpperCase() });
  if (!link) {
    throw new Error('Invitation not found');
  }

  if (link.status !== 'pending') {
    throw new Error('Invitation is no longer active');
  }

  if (link.expiresAt && Date.now() > link.expiresAt.getTime()) {
    link.status = 'expired';
    await link.save({ validateBeforeSave: false });
    throw new Error('Invitation has expired');
  }

  if (link.initiator.toString() === userId) {
    throw new Error('You cannot accept your own invite');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (link.linkType === 'parent-child') {
    if (!['child', 'standard'].includes(user.role)) {
      throw new Error('Only child accounts can join parent invites');
    }
    if (user.role === 'standard') {
      user.role = 'child';
    }
  }

  if (link.linkType === 'doctor-patient') {
    if (!['child', 'standard'].includes(user.role)) {
      throw new Error('Only patient accounts can join doctor invites');
    }
    if (user.role === 'standard') {
      user.role = 'child';
    }
  }

  user.isVerified = true;
  user.verifiedAt = user.verifiedAt || new Date();
  await user.save({ validateBeforeSave: false });

  link.linkedUser = user._id;
  link.status = 'active';
  link.acceptedAt = new Date();
  await link.save({ validateBeforeSave: false });

  return serializeLink(link);
}

async function revokeLink({ linkId, requesterId }) {
  const link = await UserLink.findById(linkId);
  if (!link) {
    throw new Error('Link not found');
  }

  if (link.initiator.toString() !== requesterId) {
    throw new Error('Only the initiator can revoke this link');
  }

  if (link.status !== 'active' && link.status !== 'pending') {
    throw new Error('Link is already inactive');
  }

  link.status = 'revoked';
  link.revokedAt = new Date();
  await link.save({ validateBeforeSave: false });

  return serializeLink(link);
}

async function listUserLinks(userId) {
  const links = await UserLink.find({
    $or: [{ initiator: userId }, { linkedUser: userId }],
    status: { $in: ['pending', 'active'] }
  }).sort({ createdAt: -1 });

  const serialized = [];
  for (const link of links) {
    serialized.push(await serializeLink(link));
  }
  return serialized;
}

async function serializeLink(linkDoc) {
  if (!linkDoc) {
    return null;
  }

  const doc = await linkDoc.populate([
    { path: 'initiator', select: 'fullName email role' },
    { path: 'linkedUser', select: 'fullName email role' }
  ]);

  return {
    id: doc._id,
    linkType: doc.linkType,
    inviteCode: doc.inviteCode,
    status: doc.status,
    expiresAt: doc.expiresAt,
    acceptedAt: doc.acceptedAt,
    revokedAt: doc.revokedAt,
    initiator: doc.initiator ? {
      id: doc.initiator._id,
      fullName: doc.initiator.fullName,
      email: doc.initiator.email,
      role: doc.initiator.role
    } : null,
    linkedUser: doc.linkedUser ? {
      id: doc.linkedUser._id,
      fullName: doc.linkedUser.fullName,
      email: doc.linkedUser.email,
      role: doc.linkedUser.role
    } : null
  };
}

module.exports = {
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
  listUserLinks
};
