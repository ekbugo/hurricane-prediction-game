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
    console.log(`Loaded ${HISTORICAL_STORMS.length} historical storms from storms.json`);
  } catch (error) {
    console.error('Error loading storms.json:', error.message);
    HISTORICAL_STORMS = [];
  }
}

loadStorms();

// Initialize database table
async function initializeDatabase() {
  try {
    // Create table if it doesn't exist (but don't drop existing data)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS predictions (
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
    
    console.log('Database table ready (existing data preserved)');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}

initializeDatabase();

// ============================================
// BADGE SYSTEM - AUTO INITIALIZATION
// ============================================

async function initializeBadgeTables() {
  try {
    console.log('🔄 Initializing badge tables...');
    
    // Create badge_definitions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS badge_definitions (
        id SERIAL PRIMARY KEY,
        badge_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        icon VARCHAR(10) NOT NULL,
        points_value INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ badge_definitions table ready');
    
    // Create user_badges table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        badge_id VARCHAR(50) NOT NULL,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB,
        UNIQUE(username, badge_id)
      )
    `);
    
    console.log('✅ user_badges table ready');
    
    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_badges_username ON user_badges(username)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_badge_definitions_category ON badge_definitions(category)`);
    
    console.log('✅ Indexes created');
    
    // Check if badges already exist
    const checkBadges = await pool.query(`SELECT COUNT(*) FROM badge_definitions`);
    const badgeCount = parseInt(checkBadges.rows[0].count);
    
    if (badgeCount === 0) {
      console.log('📝 Inserting badge definitions...');
      
      // Insert ALL badge definitions
      await pool.query(`
        INSERT INTO badge_definitions (badge_id, name, description, category, tier, icon, points_value) VALUES
        
        -- PERFORMANCE BADGES
        ('sharpshooter_bronze', 'Sharpshooter I', 'Predict within 50 NM of actual position', 'performance', 'bronze', '🎯', 100),
        ('sharpshooter_silver', 'Sharpshooter II', 'Predict within 50 NM three times', 'performance', 'silver', '🎯', 250),
        ('sharpshooter_gold', 'Sharpshooter III', 'Predict within 50 NM ten times', 'performance', 'gold', '🎯', 500),
        ('bullseye', 'Bullseye', 'Predict within 25 NM of actual position', 'performance', 'gold', '🎪', 300),
        ('laser_precision', 'Laser Precision', 'Predict within 10 NM of actual position', 'performance', 'platinum', '🔬', 500),
        ('intensity_expert_bronze', 'Intensity Expert I', 'Wind speed within 10 mph', 'performance', 'bronze', '🌡️', 100),
        ('intensity_expert_silver', 'Intensity Expert II', 'Wind speed within 10 mph three times', 'performance', 'silver', '🌡️', 250),
        ('intensity_expert_gold', 'Intensity Expert III', 'Wind speed within 5 mph five times', 'performance', 'gold', '🌡️', 500),
        ('pressure_perfect', 'Pressure Perfect', 'Pressure within 3 mb', 'performance', 'gold', '🎈', 200),
        ('diamond_prediction', 'Diamond Prediction', 'Score 1900+ points on a single prediction', 'performance', 'diamond', '💎', 1000),
        ('oracle', 'The Oracle', 'Score 1950+ points on a single prediction', 'performance', 'platinum', '🔮', 1500),
        ('perfect_storm', 'Perfect Storm', 'Score exactly 2000 points', 'performance', 'diamond', '⭐', 5000),
        
        -- CONSISTENCY BADGES
        ('early_bird', 'Early Bird', 'Submit prediction within first hour of unlock', 'consistency', 'bronze', '🌅', 50),
        ('speed_demon', 'Speed Demon', 'Submit within 2 minutes of unlock', 'consistency', 'silver', '⚡', 100),
        ('lightning_fast', 'Lightning Fast', 'Submit within 60 seconds of unlock', 'consistency', 'gold', '⚡', 200),
        ('never_miss', 'Never Miss', 'Submit all 4 predictions for a storm', 'consistency', 'bronze', '✅', 150),
        ('perfect_attendance', 'Perfect Attendance', 'Submit all predictions for 3 storms in a row', 'consistency', 'silver', '📋', 300),
        ('iron_will', 'Iron Will', 'Submit all predictions for 5 storms in a row', 'consistency', 'gold', '💪', 600),
        ('streak_3', '3-Day Streak', 'Submit predictions 3 days in a row', 'consistency', 'bronze', '🔥', 100),
        ('streak_7', '7-Day Streak', 'Submit predictions 7 days in a row', 'consistency', 'silver', '🔥', 300),
        ('streak_14', '14-Day Streak', 'Submit predictions 14 days in a row', 'consistency', 'gold', '🔥', 700),
        ('streak_30', '30-Day Streak', 'Submit predictions 30 days in a row', 'consistency', 'platinum', '🔥', 2000),
        
        -- MILESTONE BADGES
        ('first_prediction', 'First Steps', 'Submit your first prediction', 'milestone', 'bronze', '👶', 50),
        ('veteran_10', 'Veteran', 'Submit 10 predictions', 'milestone', 'bronze', '🎖️', 100),
        ('veteran_50', 'Experienced', 'Submit 50 predictions', 'milestone', 'silver', '🎖️', 300),
        ('veteran_100', 'Master Forecaster', 'Submit 100 predictions', 'milestone', 'gold', '🎖️', 1000),
        ('veteran_500', 'Legend', 'Submit 500 predictions', 'milestone', 'platinum', '🎖️', 5000),
        ('points_5k', '5K Club', 'Earn 5,000 total points', 'milestone', 'bronze', '💯', 200),
        ('points_25k', '25K Club', 'Earn 25,000 total points', 'milestone', 'silver', '💯', 500),
        ('points_50k', '50K Club', 'Earn 50,000 total points', 'milestone', 'gold', '💯', 1000),
        ('points_100k', '100K Club', 'Earn 100,000 total points', 'milestone', 'platinum', '💯', 3000),
        ('storm_survivor_5', 'Storm Survivor', 'Complete 5 different storms', 'milestone', 'bronze', '🌀', 200),
        ('storm_survivor_12', 'Storm Veteran', 'Complete all 12 storms', 'milestone', 'silver', '🌀', 500),
        
        -- COMPETITIVE BADGES
        ('top_10', 'Top 10', 'Finish in top 10 for any storm', 'competitive', 'bronze', '🏅', 200),
        ('top_5', 'Top 5', 'Finish in top 5 for any storm', 'competitive', 'silver', '🥈', 400),
        ('podium', 'Podium Finish', 'Finish in top 3 for any storm', 'competitive', 'gold', '🥉', 800),
        ('runner_up', 'Runner-Up', 'Finish 2nd place in any storm', 'competitive', 'gold', '🥈', 1200),
        ('champion', 'Storm Champion', 'Finish 1st place in any storm', 'competitive', 'platinum', '👑', 2000),
        ('repeat_champion', 'Repeat Champion', 'Finish 1st place in 3 different storms', 'competitive', 'diamond', '👑', 5000),
        ('above_average', 'Above Average', 'Score above 1500 points five times', 'competitive', 'bronze', '📈', 200),
        ('consistently_great', 'Consistently Great', 'Score above 1700 points ten times', 'competitive', 'silver', '📊', 500),
        
        -- SPECIAL/FUN BADGES
        ('comeback_kid', 'Comeback Kid', 'Go from bottom 50% to top 25% within one storm', 'special', 'gold', '💪', 300),
        ('night_owl', 'Night Owl', 'Submit prediction between 10PM-6AM', 'special', 'bronze', '🦉', 50),
        ('early_morning', 'Early Riser', 'Submit prediction between 5AM-7AM', 'special', 'bronze', '☀️', 50),
        ('cat5_survivor', 'Category 5 Survivor', 'Complete a Category 5 storm with score >1500', 'special', 'gold', '🌪️', 500),
        ('rapid_intensification', 'Rapid Intensification Expert', 'Correctly predict >25 mph wind increase', 'special', 'gold', '📈', 400),
        ('close_call', 'Too Close!', 'Predict track within 5 NM but intensity off by >30 mph', 'special', 'bronze', '😅', 100),
        ('lucky_number', 'Lucky Number', 'Score ends in 777', 'special', 'bronze', '🎰', 100),
        ('perfect_average', 'Perfect Average', 'Average exactly 1500 points over 10 predictions', 'special', 'silver', '⚖️', 200),
        ('weekend_warrior', 'Weekend Warrior', 'Submit predictions on 4 consecutive weekends', 'special', 'silver', '🎮', 300),
        ('dedication', 'True Dedication', 'Play for 30 consecutive days', 'special', 'platinum', '🏆', 2000)
      `);
      
      console.log(`✅ Inserted 50 badge definitions`);
    } else {
      console.log(`ℹ️  ${badgeCount} badges already exist, skipping insert`);
    }
    
    console.log('🎉 Badge system initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing badge tables:', error);
  }
}

initializeBadgeTables();

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

// ============================================
// BADGE HELPER FUNCTIONS
// ============================================

async function hasBadge(username, badge_id) {
  const result = await pool.query(
    `SELECT 1 FROM user_badges WHERE username = $1 AND badge_id = $2`,
    [username, badge_id]
  );
  return result.rows.length > 0;
}

async function awardBadge(username, badge_id, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO user_badges (username, badge_id, metadata)
       VALUES ($1, $2, $3)
       ON CONFLICT (username, badge_id) DO NOTHING`,
      [username, badge_id, JSON.stringify(metadata)]
    );
    console.log(`🏅 ${username} earned badge: ${badge_id}`);
  } catch (error) {
    console.error('Error awarding badge:', error);
  }
}

// Check and award badges after scoring
async function checkAndAwardBadges(username, prediction) {
  try {
    // Get user's total stats
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_predictions, 
        SUM(COALESCE(score, 0)) as total_score,
        COUNT(DISTINCT storm_id) as unique_storms
       FROM predictions 
       WHERE username = $1 AND score IS NOT NULL`,
      [username]
    );
    
    const totalPredictions = parseInt(statsResult.rows[0].total_predictions);
    const totalScore = parseInt(statsResult.rows[0].total_score);
    const uniqueStorms = parseInt(statsResult.rows[0].unique_storms);
    
    // MILESTONE BADGES - First prediction
    if (totalPredictions === 1 && !await hasBadge(username, 'first_prediction')) {
      await awardBadge(username, 'first_prediction', {});
    }
    
    // MILESTONE BADGES - Prediction counts
    if (totalPredictions === 10 && !await hasBadge(username, 'veteran_10')) {
      await awardBadge(username, 'veteran_10', { count: 10 });
    }
    if (totalPredictions === 50 && !await hasBadge(username, 'veteran_50')) {
      await awardBadge(username, 'veteran_50', { count: 50 });
    }
    if (totalPredictions === 100 && !await hasBadge(username, 'veteran_100')) {
      await awardBadge(username, 'veteran_100', { count: 100 });
    }
    if (totalPredictions === 500 && !await hasBadge(username, 'veteran_500')) {
      await awardBadge(username, 'veteran_500', { count: 500 });
    }
    
    // MILESTONE BADGES - Points
    if (totalScore >= 5000 && !await hasBadge(username, 'points_5k')) {
      await awardBadge(username, 'points_5k', { points: totalScore });
    }
    if (totalScore >= 25000 && !await hasBadge(username, 'points_25k')) {
      await awardBadge(username, 'points_25k', { points: totalScore });
    }
    if (totalScore >= 50000 && !await hasBadge(username, 'points_50k')) {
      await awardBadge(username, 'points_50k', { points: totalScore });
    }
    if (totalScore >= 100000 && !await hasBadge(username, 'points_100k')) {
      await awardBadge(username, 'points_100k', { points: totalScore });
    }
    
    // MILESTONE BADGES - Storms
    if (uniqueStorms === 5 && !await hasBadge(username, 'storm_survivor_5')) {
      await awardBadge(username, 'storm_survivor_5', { storms: 5 });
    }
    if (uniqueStorms === 12 && !await hasBadge(username, 'storm_survivor_12')) {
      await awardBadge(username, 'storm_survivor_12', { storms: 12 });
    }
    
    // PERFORMANCE BADGES - Score based (if prediction has score)
    if (prediction && prediction.score) {
      if (prediction.score >= 1900 && !await hasBadge(username, 'diamond_prediction')) {
        await awardBadge(username, 'diamond_prediction', { score: prediction.score });
      }
      if (prediction.score >= 1950 && !await hasBadge(username, 'oracle')) {
        await awardBadge(username, 'oracle', { score: prediction.score });
      }
      if (prediction.score === 2000 && !await hasBadge(username, 'perfect_storm')) {
        await awardBadge(username, 'perfect_storm', { score: 2000 });
      }
      
      // Lucky number badge
      const scoreStr = prediction.score.toString();
      if (scoreStr.endsWith('777') && !await hasBadge(username, 'lucky_number')) {
        await awardBadge(username, 'lucky_number', { score: prediction.score });
      }
    }
    
    console.log(`✅ Badge check complete for ${username}`);
  } catch (error) {
    console.error('Error checking badges:', error);
  }
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

      // Check and award badges
      await checkAndAwardBadges(pred.username, { ...pred, score: totalScore });

      console.log(`  ${pred.username}: ${totalScore} pts (Track: ${trackScore}, Intensity: ${intensityScore}, Distance: ${distanceError.toFixed(1)} NM)`);
    }

    console.log(`Scoring complete for ${stormId} ${timeframe}`);
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

// Get current active storm (24-hour rotation in UTC-6/Central Time)
function getCurrentStorm() {
  if (HISTORICAL_STORMS.length === 0) return null;
  
  // Get current time in UTC-6 (Central Time)
  const now = new Date();
  const utcMinus6 = new Date(now.getTime() - (6 * 60 * 60 * 1000));
  
  // Find which storm should be active based on gameStart times
  // Note: gameStart/gameEnd in storms.json are in UTC, but represent midnight UTC-6
  for (const storm of HISTORICAL_STORMS) {
    const stormStart = new Date(storm.gameStart);
    const stormEnd = new Date(storm.gameEnd);
    
    if (now >= stormStart && now < stormEnd) {
      return storm;
    }
  }
  
  // If no storm matches, return the first one as fallback
  return HISTORICAL_STORMS[0];
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
    
    console.log(`👤 Saved prediction: ${username} - ${stormId} - ${timeframe}`);
    
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
    
    // Only sum scores that are not null (timeframes that have closed and been scored)
    const result = await pool.query(
      `SELECT 
        username,
        SUM(COALESCE(score, 0)) as total_score,
        COUNT(*) as predictions_count,
        COUNT(score) as scored_count
      FROM predictions
      WHERE storm_id = $1 AND score IS NOT NULL
      GROUP BY username
      HAVING COUNT(score) > 0
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

// Get participants (all users who submitted predictions, no scores shown)
app.get('/api/participants/:stormId', async (req, res) => {
  try {
    const { stormId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        username,
        COUNT(*) as predictions_count,
        MIN(submitted_at) as first_prediction
      FROM predictions
      WHERE storm_id = $1
      GROUP BY username
      ORDER BY first_prediction ASC`,
      [stormId]
    );
    
    res.json({
      stormId,
      participants: result.rows,
      totalParticipants: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// Get all-time leaderboard (cumulative across all storms)
app.get('/api/leaderboard/all-time/global', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        username,
        SUM(COALESCE(score, 0)) as total_score,
        COUNT(DISTINCT storm_id) as storms_played,
        COUNT(*) as total_predictions,
        COUNT(score) as scored_predictions,
        ROUND(AVG(COALESCE(score, 0))::numeric, 1) as avg_score,
        MAX(score) as best_prediction
      FROM predictions
      WHERE score IS NOT NULL
      GROUP BY username
      HAVING COUNT(score) > 0
      ORDER BY total_score DESC
      LIMIT 100`
    );
    
    res.json({
      leaderboard: result.rows
    });
  } catch (error) {
    console.error('Error fetching all-time leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch all-time leaderboard' });
  }
});

// Get leaderboard by storm history (all past storms with scores)
app.get('/api/leaderboard/by-storm/all', async (req, res) => {
  try {
    // Get unique storms that have scored predictions
    const stormsResult = await pool.query(
      `SELECT DISTINCT storm_id
       FROM predictions
       WHERE score IS NOT NULL
       ORDER BY storm_id DESC`
    );
    
    const stormLeaderboards = [];
    
    for (const stormRow of stormsResult.rows) {
      const stormId = stormRow.storm_id;
      
      // Get leaderboard for this storm
      const leaderboardResult = await pool.query(
        `SELECT 
          username,
          SUM(COALESCE(score, 0)) as total_score,
          COUNT(*) as predictions_count,
          ROUND(AVG(COALESCE(score, 0))::numeric, 1) as avg_score
        FROM predictions
        WHERE storm_id = $1 AND score IS NOT NULL
        GROUP BY username
        HAVING COUNT(score) > 0
        ORDER BY total_score DESC
        LIMIT 10`,
        [stormId]
      );
      
      // Get storm info from loaded storms
      const stormInfo = HISTORICAL_STORMS.find(s => s.id === stormId);
      
      stormLeaderboards.push({
        stormId,
        stormName: stormInfo ? stormInfo.name : stormId,
        stormYear: stormInfo ? stormInfo.year : null,
        leaderboard: leaderboardResult.rows
      });
    }
    
    res.json({
      storms: stormLeaderboards
    });
  } catch (error) {
    console.error('Error fetching storm history:', error);
    res.status(500).json({ error: 'Failed to fetch storm history' });
  }
});

// Get user's personal best and stats
app.get('/api/user/:username/stats', async (req, res) => {
  try {
    const { username } = req.params;
    
    // Get overall stats
    const statsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT storm_id) as storms_played,
        COUNT(*) as total_predictions,
        COUNT(score) as scored_predictions,
        SUM(COALESCE(score, 0)) as total_score,
        ROUND(AVG(COALESCE(score, 0))::numeric, 1) as avg_score,
        MAX(score) as best_score,
        MIN(score) as worst_score
      FROM predictions
      WHERE username = $1 AND score IS NOT NULL`,
      [username]
    );
    
    // Get best predictions
    const bestPredictionsResult = await pool.query(
      `SELECT 
        storm_id,
        timeframe,
        score,
        predicted_lat,
        predicted_lon,
        predicted_wind_speed,
        predicted_pressure,
        actual_lat,
        actual_lon,
        actual_wind_speed,
        actual_pressure,
        submitted_at
      FROM predictions
      WHERE username = $1 AND score IS NOT NULL
      ORDER BY score DESC
      LIMIT 5`,
      [username]
    );
    
    // Add storm names to best predictions
    const bestPredictions = bestPredictionsResult.rows.map(pred => {
      const stormInfo = HISTORICAL_STORMS.find(s => s.id === pred.storm_id);
      return {
        ...pred,
        stormName: stormInfo ? stormInfo.name : pred.storm_id
      };
    });
    
    // Get rank in all-time leaderboard
    const rankResult = await pool.query(
      `WITH ranked_users AS (
        SELECT 
          username,
          SUM(COALESCE(score, 0)) as total_score,
          RANK() OVER (ORDER BY SUM(COALESCE(score, 0)) DESC) as rank
        FROM predictions
        WHERE score IS NOT NULL
        GROUP BY username
      )
      SELECT rank, total_score
      FROM ranked_users
      WHERE username = $1`,
      [username]
    );
    
    res.json({
      username,
      stats: statsResult.rows[0] || {},
      bestPredictions,
      globalRank: rankResult.rows[0] || { rank: null, total_score: 0 }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
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

// ============================================
// BADGE API ENDPOINTS
// ============================================

// Get user's badges
app.get('/api/user/:username/badges', async (req, res) => {
  try {
    const { username } = req.params;
    
    const result = await pool.query(
      `SELECT ub.*, bd.name, bd.description, bd.icon, bd.tier, bd.category, bd.points_value
       FROM user_badges ub
       JOIN badge_definitions bd ON ub.badge_id = bd.badge_id
       WHERE ub.username = $1
       ORDER BY ub.earned_at DESC`,
      [username]
    );
    
    res.json({
      username,
      badges: result.rows,
      total_badges: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching badges:', error);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// Get all badge definitions
app.get('/api/badges/definitions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM badge_definitions ORDER BY category, tier, name`
    );
    
    res.json({
      badges: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching badge definitions:', error);
    res.status(500).json({ error: 'Failed to fetch badge definitions' });
  }
});

// Get badge progress for user
app.get('/api/user/:username/badge-progress', async (req, res) => {
  try {
    const { username } = req.params;
    
    const stats = await pool.query(
      `SELECT 
        COUNT(*) as total_predictions,
        SUM(COALESCE(score, 0)) as total_score,
        COUNT(DISTINCT storm_id) as unique_storms
       FROM predictions 
       WHERE username = $1`,
      [username]
    );
    
    const progress = {
      milestones: {
        predictions: parseInt(stats.rows[0].total_predictions || 0),
        points: parseInt(stats.rows[0].total_score || 0),
        storms: parseInt(stats.rows[0].unique_storms || 0)
      }
    };
    
    res.json({ username, progress });
  } catch (error) {
    console.error('Error fetching badge progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌀 Hurricane Prediction Game API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊📊 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});
