const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Load historical storms from JSON file
let HISTORICAL_STORMS = [];

function loadStorms() {
  try {
    const stormsPath = path.join(__dirname, 'storms.json');
    const stormsData = fs.readFileSync(stormsPath, 'utf8');
    const parsed = JSON.parse(stormsData);
    HISTORICAL_STORMS = parsed.storms;
    console.log(`✅ Loaded ${HISTORICAL_STORMS.length} historical storms from storms.json`);
  } catch (error) {
    console.error('⚠️ Error loading storms.json:', error.message);
    HISTORICAL_STORMS = [];
  }
}

loadStorms();

// Initialize database table
async function initializeDatabase() {
  try {
    await pool.query(`DROP TABLE IF EXISTS predictions`);
    console.log('✅ Old predictions table dropped');
    
    await pool.query(`
      CREATE TABLE predictions (
        id SERIAL PRIMARY KEY,
        prediction_id VARCHAR(50) UNIQUE NOT NULL,
        username VARCHAR(100) NOT NULL,
        storm_id VARCHAR(50) NOT NULL,
        timeframe VARCHAR(10) NOT NULL,
        predicted_lat DECIMAL(10, 6) NOT NULL,
        predicted_lon DECIMAL(10, 6) NOT NULL,
        predicted_wind_speed INTEGER NOT NULL,
        predicted_pressure INTEGER NOT NULL,
        actual_lat DECIMAL(10, 6),
        actual_lon DECIMAL(10, 6),
        actual_wind_speed INTEGER,
        actual_pressure INTEGER,
        score INTEGER,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, storm_id, timeframe)
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_storm_timeframe ON predictions(storm_id, timeframe);
      CREATE INDEX IF NOT EXISTS idx_username_storm ON predictions(username, storm_id);
    `);
    
    console.log('✅ New predictions table created');
  } catch (error) {
    console.error('⚠️ Error initializing database:', error.message);
  }
}

initializeDatabase();

// Get current active storm (24-hour rotation)
function getCurrentStorm() {
  if (HISTORICAL_STORMS.length === 0) return null;
  
  const referenceDate = new Date('2025-01-01T00:00:00Z');
  const now = new Date();
  const daysSinceReference = Math.floor((now - referenceDate) / (24 * 60 * 60 * 1000));
  const currentStormIndex = daysSinceReference % HISTORICAL_STORMS.length;
  
  return HISTORICAL_STORMS[currentStormIndex];
}

// Determine which timeframe is currently active
function getActiveTimeframe(storm) {
  if (!storm || !storm.timeframes) return null;
  
  const now = new Date();
  const gameStart = new Date(storm.gameStart);
  
  // Calculate hours since game start
  const hoursSinceStart = (now - gameStart) / (1000 * 60 * 60);
  
  // Determine active timeframe based on time
  if (hoursSinceStart < 0) {
    return null; // Game hasn't started yet
  } else if (hoursSinceStart < 6) {
    return '0600'; // 0000-0559: predict 0600
  } else if (hoursSinceStart < 12) {
    return '1200'; // 0600-1159: predict 1200
  } else if (hoursSinceStart < 18) {
    return '1800'; // 1200-1759: predict 1800
  } else if (hoursSinceStart < 24) {
    return '0000'; // 1800-2359: predict next 0000
  } else {
    return null; // Game ended
  }
}

// Get game state
app.get('/api/game/state', (req, res) => {
  try {
    const currentStorm = getCurrentStorm();
    
    if (!currentStorm) {
      return res.status(404).json({ error: 'No active storm' });
    }
    
    const activeTimeframe = getActiveTimeframe(currentStorm);
    const now = new Date();
    const gameStart = new Date(currentStorm.gameStart);
    const hoursSinceStart = (now - gameStart) / (1000 * 60 * 60);
    
    // Calculate time until next timeframe unlocks
    let nextUnlockHours = 0;
    if (hoursSinceStart < 6) {
      nextUnlockHours = 6 - hoursSinceStart;
    } else if (hoursSinceStart < 12) {
      nextUnlockHours = 12 - hoursSinceStart;
    } else if (hoursSinceStart < 18) {
      nextUnlockHours = 18 - hoursSinceStart;
    } else if (hoursSinceStart < 24) {
      nextUnlockHours = 24 - hoursSinceStart;
    }
    
    res.json({
      storm: {
        id: currentStorm.id,
        name: currentStorm.name,
        year: currentStorm.year,
        gameStart: currentStorm.gameStart,
        gameEnd: currentStorm.gameEnd
      },
      timeframes: currentStorm.timeframes,
      activeTimeframe: activeTimeframe,
      hoursSinceStart: hoursSinceStart.toFixed(1),
      nextUnlockHours: nextUnlockHours.toFixed(1)
    });
  } catch (error) {
    console.error('Error getting game state:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
});

// Submit prediction for a timeframe
app.post('/api/predictions', async (req, res) => {
  try {
    const {
      username,
      stormId,
      timeframe,
      lat,
      lon,
      windSpeed,
      pressure
    } = req.body;
    
    if (!username || !stormId || !timeframe || !lat || !lon || !windSpeed || !pressure) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify this timeframe is currently active
    const currentStorm = getCurrentStorm();
    if (!currentStorm || currentStorm.id !== stormId) {
      return res.status(400).json({ error: 'Storm not active' });
    }
    
    const activeTimeframe = getActiveTimeframe(currentStorm);
    if (activeTimeframe !== timeframe) {
      return res.status(400).json({ error: `Timeframe ${timeframe} is not currently active. Active: ${activeTimeframe}` });
    }
    
    const predictionId = `${username}-${stormId}-${timeframe}-${Date.now()}`;
    
    // Insert prediction
    const result = await pool.query(
      `INSERT INTO predictions 
      (prediction_id, username, storm_id, timeframe, predicted_lat, predicted_lon, predicted_wind_speed, predicted_pressure)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [predictionId, username, stormId, timeframe, lat, lon, windSpeed, pressure]
    );
    
    console.log(`💾 Saved prediction: ${username} - ${stormId} - ${timeframe}`);
    
    res.status(201).json({
      success: true,
      prediction: result.rows[0],
      message: 'Prediction submitted successfully'
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'You have already submitted a prediction for this timeframe' });
    }
    console.error('Error submitting prediction:', error);
    res.status(500).json({ error: 'Failed to submit prediction' });
  }
});

// Get user's predictions for current storm
app.get('/api/predictions/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const currentStorm = getCurrentStorm();
    
    if (!currentStorm) {
      return res.json({ predictions: [] });
    }
    
    const result = await pool.query(
      `SELECT * FROM predictions
      WHERE username = $1 AND storm_id = $2
      ORDER BY timeframe ASC`,
      [username, currentStorm.id]
    );
    
    res.json({
      username,
      stormId: currentStorm.id,
      predictions: result.rows
    });
  } catch (error) {
    console.error('Error fetching user predictions:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// Get leaderboard (cumulative scores)
app.get('/api/leaderboard/:stormId', async (req, res) => {
  try {
    const { stormId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        username,
        SUM(COALESCE(score, 0)) as total_score,
        COUNT(*) as predictions_count
      FROM predictions
      WHERE storm_id = $1
      GROUP BY username
      ORDER BY total_score DESC
      LIMIT 100`,
      [stormId]
    );
    
    res.json({
      stormId,
      leaderboard: result.rows
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM predictions');
    const predictionsCount = parseInt(result.rows[0].count);
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      predictionsCount: predictionsCount,
      stormsLoaded: HISTORICAL_STORMS.length,
      database: 'connected'
    });
  } catch (error) {
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌀 Hurricane Prediction Game API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});
