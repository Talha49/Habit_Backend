require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/v1/User');

async function clearUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const result = await User.deleteMany({});
    console.log(`Successfully deleted ${result.deletedCount} users from the database.`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error clearing users:', error);
    process.exit(1);
  }
}

clearUsers();
