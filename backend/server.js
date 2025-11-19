const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (replace with database in production)
let predictions = [];
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
    // Fallback to hardcoded storms if file doesn't exist
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
  const dayOfWeek = now.getUTCDay(); // 0=Sunday, 1=Monday
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
app.post('/api/predictions', (req, res) => {
    try {
        const prediction = {
            id: Date.now().toString(),
            ...req.body,
            submittedAt: new Date().toISOString(),
            score: null,
            accuracy: null
        };
        
        if (!prediction.username || !prediction.stormId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        predictions.push(prediction);
        
        res.status(201).json({
            success: true,
            prediction: prediction,
            message: 'Prediction submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting prediction:', error);
        res.status(500).json({ error: 'Failed to submit prediction' });
    }
});

// Get leaderboard for a specific storm
app.get('/api/leaderboard/:stormId', (req, res) => {
    try {
        const { stormId } = req.params;
        
        const stormPredictions = predictions
            .filter(p => p.stormId === stormId)
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 100);
        
        res.json({
            stormId,
            predictions: stormPredictions,
            totalPredictions: stormPredictions.length
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// Get all predictions for a user
app.get('/api/predictions/user/:username', (req, res) => {
    try {
        const { username } = req.params;
        
        const userPredictions = predictions.filter(
            p => p.username.toLowerCase() === username.toLowerCase()
        );
        
        res.json({
            username,
            predictions: userPredictions,
            totalPredictions: userPredictions.length
        });
    } catch (error) {
        console.error('Error fetching user predictions:', error);
        res.status(500).json({ error: 'Failed to fetch predictions' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        predictionsCount: predictions.length,
        activeStormsCount: activeStorms.length
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🌀 Hurricane Prediction Game API running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
