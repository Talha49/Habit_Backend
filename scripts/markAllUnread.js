const mongoose = require('mongoose');
require('dotenv').config();

const CoachNotification = require('../models/v1/CoachNotification');

const USER_ID = '69ef9871e2233cdd35cc0959';

async function markAllUnread() {
  try {
    console.log(`🚀 Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find all read notifications for Anas and set them to unread
    const result = await CoachNotification.updateMany(
      { userId: USER_ID, status: 'read' },
      { $set: { status: 'unread' } }
    );
    
    console.log(`✅ Successfully marked ${result.modifiedCount} notifications as UNREAD!`);
    
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

markAllUnread();
