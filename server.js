const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const config = require('./config');
const { seedCategories } = require('./scripts/seedCategories');
const { clerkMiddleware, attachClerkAuthContext } = require('./middleware/clerkAuth');

// Load env vars
dotenv.config();

const app = express();

// Enable CORS for all origins and methods
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

app.use(express.json());
app.use(clerkMiddleware);
app.use(attachClerkAuthContext);

// Routes
app.use('/v1/auth', require('./routes/v1/authRoutes'));
app.use('/v1/categories', require('./routes/v1/categoryRoutes'));
app.use('/v1/territories', require('./routes/v1/territoryRoutes'));
app.use('/v1/geofences', require('./routes/v1/geofenceRoutes'));
app.use('/v1/location', require('./routes/v1/locationRoutes'));

const startServer = async () => {
  try {
    await connectDB();
    await seedCategories();

    const PORT = config.PORT;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
