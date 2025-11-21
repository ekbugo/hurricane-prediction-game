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

// Calculate great-circle distance between two points (Haversine formula)
// Returns distance in nautical miles
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate Track Score (0-1000 pts based on distance error)
function calculateTrackScore(distanceErrorNM) {
  // Exponential decay: heavily penalize distance errors
  // 0 NM = 1000 pts, 50 NM = ~600 pts, 100 NM = ~368 pts, 200 NM = ~135 pts
  const score = 1000 * Math.exp(-0.01 * distanceErrorNM);
  return Math.round(Math.max(0, score));
}

// Calculate Intensity Score (0-1000 pts based on wind + pressure errors)
function calculateIntensityScore(windError, pressureError) {
  // Weight: winds are harder to predict than pressure
  // Wind contributes 60%, pressure 40%
  const windScore = 600 * Math.exp(-0.02 * Math.abs(windError));
  const pressureScore = 400 * Math.exp(-0.05 * Math.abs(pressureError));
  const totalScore = windScore + pressureScore;
  return Math.round(Math.max(0, totalScore));
}

// Score all predictions for a specific storm and timeframe
async function scorePredictions(stormId, timeframe, actualData) {
  try {
    // Get all predictions for this storm/timeframe that haven't been scored
    const predictions = await pool.query(
      `SELECT * FROM predictions 
       WHERE storm_id = $1 AND timeframe = $2 AND score IS NULL`,
      [stormId, timeframe]
    );

    console.log(`📊 Scoring ${predictions.rows.length} predictions for ${stormId} ${timeframe}`);

    for (const pred of predictions.rows) {
      // Calculate distance error
      const distanceError = calculateDistance(
        pred.predicted_lat,
        pred.predicted_lon,
        actualData.lat,
        actualData.lon
      );

      // Calculate wind and pressure errors
      const windError = Math.abs(pred.predicted_wind_speed - actualData.windSpeed);
      const pressureError = Math.abs(pred.predicted_pressure - actualData.pressure);

      // Calculate scores
      const trackScore = calculateTrackScore(distanceError);
      const intensityScore = calculateIntensityScore(windError, pressureError);
      const totalScore = trackScore + intensityScore;

      // Update prediction with scores and actual data
      await pool.query(
        `UPDATE predictions 
         SET score = $1, 
             actual_lat = $2, 
             actual_lon = $3,
             actual_wind_speed = $4,
             actual_pressure = $5
         WHERE id = $6`,
        [totalScore, actualData.lat, actualData.lon, actualData.windSpeed, actualData.pressure, pred.id]
      );

      console.log(`  ✓ ${pred.username}: ${totalScore} pts (Track: ${trackScore}, Intensity: ${intensityScore}, Distance: ${distanceError.toFixed(1)} NM)`);
    }

    console.log(`✅ Scoring complete for ${stormId} ${timeframe}`);
  } catch (error) {
    console.error('Error scoring predictions:', error);
  }
}

// Automatic scoring when timeframe passes
async function checkAndScore() {
  try {
    const currentStorm = getCurrentStorm();
    if (!currentStorm) return;

    const now = new Date();
    const gameStart = new Date(currentStorm.gameStart);
    const hoursSinceStart = (now - gameStart) / (1000 * 60 * 60);

    // Check each timeframe and score if it just passed
    const timeframesToScore = [];
    
    if (hoursSinceStart >= 6 && hoursSinceStart < 7) {
      timeframesToScore.push({ tf: '0600', data: currentStorm.timeframes.find(t => t.timeframe === '0600') });
    }
    if (hoursSinceStart >= 12 && hoursSinceStart < 13) {
      timeframesToScore.push({ tf: '1200', data: currentStorm.timeframes.find(t => t.timeframe === '1200') });
    }
    if (hoursSinceStart >= 18 && hoursSinceStart < 19) {
      timeframesToScore.push({ tf: '1800', data: currentStorm.timeframes.find(t => t.timeframe === '1800') });
    }
    if (hoursSinceStart >= 24 && hoursSinceStart < 25) {
      timeframesToScore.push({ tf: '0000', data: currentStorm.timeframes.find(t => t.timeframe === '0000' && t.type === 'prediction') });
    }

    for (const { tf, data } of timeframesToScore) {
      if (data) {
        await scorePredictions(currentStorm.id, tf, data);
      }
    }
  } catch (error) {
    console.error('Error in automatic scoring:', error);
  }
}

// Run scoring check every minute
setInterval(checkAndScore, 60000);

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

// Manual scoring endpoint (for admin/testing)
app.post('/api/admin/score/:stormId/:timeframe', async (req, res) => {
  try {
    const { stormId, timeframe } = req.params;
    
    const storm = HISTORICAL_STORMS.find(s => s.id === stormId);
    if (!storm) {
      return res.status(404).json({ error: 'Storm not found' });
    }
    
    const actualData = storm.timeframes.find(tf => tf.timeframe === timeframe && tf.type === 'prediction');
    if (!actualData) {
      return res.status(404).json({ error: 'Timeframe not found' });
    }
    
    await scorePredictions(stormId, timeframe, actualData);
    
    res.json({
      success: true,
      message: `Scored all predictions for ${stormId} ${timeframe}`
    });
  } catch (error) {
    console.error('Error in manual scoring:', error);
    res.status(500).json({ error: 'Failed to score predictions' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌀 Hurricane Prediction Game API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});
