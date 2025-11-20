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

// In-memory storage for active storms
let activeStorms = [];

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
    console.error('⚠️ Error loading storms.json, using fallback data:', error.message);
    HISTORICAL_STORMS = [
      {
        id: 'irma-2017',
        name: 'Hurricane Irma',
        year: 2017,
        actualLandfall: { lat: 25.0, lon: -80.9, time: '2017-09-10T13:00:00Z', category: 4, windSpeed: 130, pressure: 929 },
        track: [
          { time: '2017-08-30T06:00:00Z', lat: 16.5, lon: -27.9, windSpeed: 35, pressure: 1008, category: 0 },
          { time: '2017-09-10T13:00:00Z', lat: 25.0, lon: -80.9, windSpeed: 130, pressure: 929, category: 4 }
        ]
      }
    ];
  }
}

// Load storms on startup
loadStorms();

// Initialize database table
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        prediction_id VARCHAR(50) UNIQUE NOT NULL,
        username VARCHAR(100) NOT NULL,
        storm_id VARCHAR(50) NOT NULL,
        landfall_lat DECIMAL(10, 6),
        landfall_lon DECIMAL(10, 6),
        landfall_time TIMESTAMP,
        peak_category INTEGER,
        peak_wind_speed INTEGER,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        score INTEGER,
        accuracy DECIMAL(5, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Database table initialized');
  } catch (error) {
    console.error('⚠️ Error initializing database:', error.message);
  }
}

// Initialize database on startup
initializeDatabase();

// Get current week's storm
function getCurrentWeekStorm() {
  const referenceDate = new Date('2025-01-01T00:00:00Z');
  const now = new Date();
  const weeksSinceReference = Math.floor((now - referenceDate) / (7 * 24 * 60 * 60 * 1000));
  const currentStormIndex = weeksSinceReference % HISTORICAL_STORMS.length;
  return HISTORICAL_STORMS[currentStormIndex];
}

// Simulate progression through storm
function getSimulatedStormPosition(storm) {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hourOfDay = now.getUTCHours();
  const weekProgress = (dayOfWeek + hourOfDay / 24) / 7;
  
  const trackIndex = Math.floor(weekProgress * storm.track.length);
  const safeIndex = Math.min(trackIndex, storm.track.length - 1);
  const currentPosition = storm.track[safeIndex];
  
  return {
    current: currentPosition,
    historical: storm.track.slice(0, safeIndex + 1),
    forecast: storm.track.slice(safeIndex),
    weekProgress: (weekProgress * 100).toFixed(1),
    daysRemaining: 7 - dayOfWeek
  };
}

// Weekly historical storm endpoint
app.get('/api/storms/weekly', (req, res) => {
  try {
    const currentStorm = getCurrentWeekStorm();
    const simulatedData = getSimulatedStormPosition(currentStorm);
    
    res.json({
      mode: 'historical-replay',
      storm: {
        id: currentStorm.id,
        name: currentStorm.name,
        year: currentStorm.year,
        currentLat: simulatedData.current.lat,
        currentLon: simulatedData.current.lon,
        currentWindSpeed: simulatedData.current.windSpeed,
        currentPressure: simulatedData.current.pressure,
        currentCategory: simulatedData.current.category,
        status: 'active'
      },
      historicalTrack: simulatedData.historical,
      forecastTrack: simulatedData.forecast,
      metadata: {
        weekProgress: simulatedData.weekProgress,
        daysRemaining: simulatedData.daysRemaining,
        nextStormChange: 'Next Monday 00:00 UTC',
        actualLandfall: currentStorm.actualLandfall
      }
    });
  } catch (error) {
    console.error('Error in weekly storm:', error);
    res.status(500).json({ error: 'Failed to get weekly storm', message: error.message });
  }
});

// NHC API Proxy
app.get('/api/storms/current', async (req, res) => {
    try {
        const response = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json');
        
        if (!response.ok) {
            throw new Error('Failed to fetch from NHC');
        }
        
        const data = await response.json();
        
        if (data.activeStorms && data.activeStorms.length > 0) {
            activeStorms = data.activeStorms;
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching NHC data:', error);
        res.json({ 
            error: 'No active storms at this time',
            demo: true,
            activeStorms: [],
            message: 'Currently no active tropical storms or hurricanes. Check back during hurricane season!'
        });
    }
});

// Get specific storm details
app.get('/api/storms/:stormId', async (req, res) => {
    try {
        const { stormId } = req.params;
        const storm = activeStorms.find(s => s.id === stormId);
        
        if (!storm) {
            return res.status(404).json({ error: 'Storm not found' });
        }
        
        res.json(storm);
    } catch (error) {
        console.error('Error fetching storm details:', error);
        res.status(500).json({ error: 'Failed to fetch storm details' });
    }
});

// Submit a prediction
app.post('/api/predictions', async (req, res) => {
    try {
        const {
            username,
            stormId,
            landfallLat,
            landfallLon,
            landfallTime,
            peakCategory,
            peakWindSpeed
        } = req.body;
        
        if (!username || !stormId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const predictionId = Date.now().toString();
        
        // Insert into database
        const result = await pool.query(
            `INSERT INTO predictions 
            (prediction_id, username, storm_id, landfall_lat, landfall_lon, landfall_time, peak_category, peak_wind_speed)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [predictionId, username, stormId, landfallLat, landfallLon, landfallTime, peakCategory, peakWindSpeed]
        );
        
        console.log(`💾 Saved prediction for ${username} on storm ${stormId}`);
        
        res.status(201).json({
            success: true,
            prediction: result.rows[0],
            message: 'Prediction submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting prediction:', error);
        res.status(500).json({ error: 'Failed to submit prediction' });
    }
});

// Get leaderboard for a specific storm
app.get('/api/leaderboard/:stormId', async (req, res) => {
    try {
        const { stormId } = req.params;
        
        const result = await pool.query(
            `SELECT 
                prediction_id as id,
                username,
                storm_id as "stormId",
                landfall_lat as "landfallLat",
                landfall_lon as "landfallLon",
                landfall_time as "landfallTime",
                peak_category as "peakCategory",
                peak_wind_speed as "peakWindSpeed",
                submitted_at as "submittedAt",
                score,
                accuracy
            FROM predictions
            WHERE storm_id = $1
            ORDER BY score DESC NULLS LAST, submitted_at ASC
            LIMIT 100`,
            [stormId]
        );
        
        res.json({
            stormId,
            predictions: result.rows,
            totalPredictions: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// Get all predictions for a user
app.get('/api/predictions/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        const result = await pool.query(
            `SELECT 
                prediction_id as id,
                username,
                storm_id as "stormId",
                landfall_lat as "landfallLat",
                landfall_lon as "landfallLon",
                landfall_time as "landfallTime",
                peak_category as "peakCategory",
                peak_wind_speed as "peakWindSpeed",
                submitted_at as "submittedAt",
                score,
                accuracy
            FROM predictions
            WHERE LOWER(username) = LOWER($1)
            ORDER BY submitted_at DESC`,
            [username]
        );
        
        res.json({
            username,
            predictions: result.rows,
            totalPredictions: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching user predictions:', error);
        res.status(500).json({ error: 'Failed to fetch predictions' });
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        // Test database connection
        const result = await pool.query('SELECT COUNT(*) FROM predictions');
        const predictionsCount = parseInt(result.rows[0].count);
        
        res.json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            predictionsCount: predictionsCount,
            activeStormsCount: activeStorms.length,
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
