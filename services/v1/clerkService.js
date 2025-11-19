const { clerkClient } = require('@clerk/clerk-sdk-node');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../../config');
const User = require('../../models/v1/User');

const hasClerkConfig = Boolean(config.CLERK_SECRET_KEY);

const getClerkUser = async (clerkUserId) => {
  if (!hasClerkConfig || !clerkUserId) {
    return null;
  }

  try {
    return await clerkClient.users.getUser(clerkUserId);
  } catch (error) {
    console.error('❌ clerkService: Failed to fetch Clerk user', clerkUserId, error.message);
    return null;
  }
};

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const extractEmailsFromClerkUser = (clerkUser) => {
  if (!clerkUser) {
    return [];
  }

  const emails = new Set();

  if (clerkUser.primaryEmailAddress?.emailAddress) {
    emails.add(normalizeEmail(clerkUser.primaryEmailAddress.emailAddress));
  }

  if (Array.isArray(clerkUser.emailAddresses)) {
    clerkUser.emailAddresses.forEach(({ emailAddress }) => {
      if (emailAddress) {
        emails.add(normalizeEmail(emailAddress));
      }
    });
  }

  return Array.from(emails).filter(Boolean);
};

const extractPrimaryEmail = (clerkUser) => {
  if (!clerkUser) return null;
  if (clerkUser.primaryEmailAddress?.emailAddress) {
    return normalizeEmail(clerkUser.primaryEmailAddress.emailAddress);
  }
  const emails = extractEmailsFromClerkUser(clerkUser);
  return emails[0] || null;
};

const extractDisplayName = (clerkUser) => {
  if (!clerkUser) return 'Clerk User';
  if (clerkUser.fullName) return clerkUser.fullName;
  const parts = [clerkUser.firstName, clerkUser.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  const email = extractPrimaryEmail(clerkUser);
  if (email) return email.split('@')[0];
  return 'Clerk User';
};

const extractPrimaryPhone = (clerkUser) => {
  if (!clerkUser) return null;
  const phone = clerkUser.primaryPhoneNumber?.phoneNumber;
  if (phone) return phone;
  if (Array.isArray(clerkUser.phoneNumbers) && clerkUser.phoneNumbers.length > 0) {
    const entry = clerkUser.phoneNumbers.find((p) => p?.phoneNumber);
    if (entry?.phoneNumber) {
      return entry.phoneNumber;
    }
  }
  return null;
};

const findUserByClerkId = async (clerkUserId) => {
  if (!clerkUserId) {
    return null;
  }
  return User.findOne({ clerkId: clerkUserId });
};

const findUserByEmails = async (emails) => {
  if (!Array.isArray(emails) || emails.length === 0) {
    return null;
  }

  return User.findOne({ email: { $in: emails } });
};

const findLegacyUserForClerkUser = async (clerkUser) => {
  if (!clerkUser) {
    return { user: null, matchType: null };
  }

  const { id: clerkUserId } = clerkUser;

  const userByClerkId = await findUserByClerkId(clerkUserId);
  if (userByClerkId) {
    return { user: userByClerkId, matchType: 'clerkId' };
  }

  const emails = extractEmailsFromClerkUser(clerkUser);
  if (emails.length === 0) {
    return { user: null, matchType: null };
  }

  const userByEmail = await findUserByEmails(emails);
  if (userByEmail) {
    return { user: userByEmail, matchType: 'email' };
  }

  return { user: null, matchType: null };
};

const linkOrCreateUserFromClerk = async (clerkUser) => {
  if (!clerkUser) {
    return { user: null, matchType: null, wasLinked: false, wasCreated: false };
  }

  const now = new Date();
  const { user: existingUser, matchType } = await findLegacyUserForClerkUser(clerkUser);
  const primaryEmail = extractPrimaryEmail(clerkUser);
  const allEmails = extractEmailsFromClerkUser(clerkUser);

  if (existingUser) {
    let shouldSave = false;
    if (!existingUser.clerkId) {
      existingUser.clerkId = clerkUser.id;
      shouldSave = true;
    }
    if (primaryEmail && existingUser.clerkPrimaryEmail !== primaryEmail) {
      existingUser.clerkPrimaryEmail = primaryEmail;
      shouldSave = true;
    }
    if (!existingUser.clerkLinkedAt) {
      existingUser.clerkLinkedAt = now;
      shouldSave = true;
    }
    existingUser.lastClerkLoginAt = now;
    shouldSave = true;

    if (!existingUser.isVerified) {
      existingUser.isVerified = true;
      existingUser.verificationMethod = existingUser.verificationMethod || 'clerk';
      existingUser.verifiedAt = existingUser.verifiedAt || now;
      shouldSave = true;
    }

    if (Array.isArray(existingUser.authProviders) && existingUser.authProviders.length > 0) {
      const providers = new Set(existingUser.authProviders);
      providers.add('clerk');
      existingUser.authProviders = Array.from(providers);
      shouldSave = true;
    } else {
      existingUser.authProviders = ['legacy', 'clerk'];
      shouldSave = true;
    }

    if (shouldSave) {
      await existingUser.save({ validateBeforeSave: false });
    }

    return {
      user: existingUser,
      matchType: matchType || 'clerkId',
      wasLinked: matchType === 'email' && existingUser.clerkId === clerkUser.id,
      wasCreated: false,
    };
  }

  const syntheticEmail = primaryEmail || `${clerkUser.id}@clerk-users.local`;
  const syntheticPhone = extractPrimaryPhone(clerkUser) || `CLERK-${clerkUser.id}`;
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  const newUser = new User({
    fullName: extractDisplayName(clerkUser),
    phone: syntheticPhone,
    email: syntheticEmail,
    password: hashedPassword,
    professional: 'Clerk User',
    role: 'standard',
    isVerified: true,
    verificationMethod: 'clerk',
    verifiedAt: now,
    clerkId: clerkUser.id,
    clerkPrimaryEmail: primaryEmail,
    clerkLinkedAt: now,
    lastClerkLoginAt: now,
    createdVia: 'clerk',
    authProviders: ['clerk'],
  });

  if (allEmails.length > 0) {
    newUser.additionalEmails = allEmails;
  }

  await newUser.save({ validateBeforeSave: false });

  return {
    user: newUser,
    matchType: 'created',
    wasLinked: false,
    wasCreated: true,
  };
};

module.exports = {
  getClerkUser,
  extractEmailsFromClerkUser,
  findUserByClerkId,
  findUserByEmails,
  findLegacyUserForClerkUser,
  linkOrCreateUserFromClerk,
};


