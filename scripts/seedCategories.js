const Category = require('../models/v1/Category');

const seedCategories = async () => {
  try {
    console.log('🌱 Starting category seed data...');
    
    // Clear existing categories to strictly maintain only the 4 required
    await Category.deleteMany({});
    console.log('🗑️ Cleared existing categories.');

    const categories = [
      {
        name: 'Study',
        description: 'Learning and educational habits',
        icon: 'book',
        color: '#4ECDC4',
        sortOrder: 1
      },
      {
        name: 'Fitness',
        description: 'Physical health and exercise habits',
        icon: 'fitness',
        color: '#FF6B6B',
        sortOrder: 2
      },
      {
        name: 'Personal Development',
        description: 'Self-improvement and growth',
        icon: 'star',
        color: '#F7DC6F',
        sortOrder: 3
      },
      {
        name: 'Religious Activity',
        description: 'Spiritual and religious habits',
        icon: 'moon',
        color: '#DDA0DD',
        sortOrder: 4
      }
    ];

    await Category.insertMany(categories);
    console.log(`✅ Successfully seeded ${categories.length} categories`);
    
  } catch (error) {
    console.error('❌ Error seeding categories:', error.message);
    throw error;
  }
};

module.exports = { seedCategories };
