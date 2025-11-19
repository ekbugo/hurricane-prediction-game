const express = require('express');
const cors = require('cors');
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

// NHC API Proxy - Solves CORS issues
app.get('/api/storms/current', async (req, res) => {
    try {
        const response = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json');
        
        if (!response.ok) {
            throw new Error('Failed to fetch from NHC');
        }
        
        const data = await response.json();
        
        // Cache active storms
        if (data.activeStorms && data.activeStorms.length > 0) {
            activeStorms = data.activeStorms;
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching NHC data:', error);
        // Return demo mode response
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
        
        // Find storm in cached data
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
            score: null, // Will be calculated after storm passes
            accuracy: null
        };
        
        // Validate prediction
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
            .slice(0, 100); // Top 100
        
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

// Calculate scores (admin endpoint - would need authentication in production)
app.post('/api/admin/calculate-scores/:stormId', (req, res) => {
    try {
        const { stormId } = req.params;
        const { actualData } = req.body;
        
        if (!actualData) {
            return res.status(400).json({ error: 'Missing actual storm data' });
        }
        
        // Find all predictions for this storm
        const stormPredictions = predictions.filter(p => p.stormId === stormId);
        
        // Calculate scores for each prediction
        stormPredictions.forEach(prediction => {
            const score = calculatePredictionScore(prediction, actualData);
            prediction.score = score;
            prediction.accuracy = (score / 1000 * 100).toFixed(1);
            prediction.scored = true;
            prediction.scoredAt = new Date().toISOString();
        });
        
        res.json({
            success: true,
            message: `Scored ${stormPredictions.length} predictions`,
            predictionsScored: stormPredictions.length
        });
    } catch (error) {
        console.error('Error calculating scores:', error);
        res.status(500).json({ error: 'Failed to calculate scores' });
    }
});

// Scoring algorithm
function calculatePredictionScore(prediction, actualData) {
    let score = 0;
    const maxScore = 1000;
    
    // Landfall location accuracy (300 points max)
    const latDiff = Math.abs(parseFloat(prediction.landfallLat) - actualData.landfallLat);
    const lonDiff = Math.abs(parseFloat(prediction.landfallLon) - actualData.landfallLon);
    const distanceError = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
    const locationScore = Math.max(0, 300 - (distanceError * 50));
    score += locationScore;
    
    // Wind speed accuracy (250 points max)
    const windError = Math.abs(parseInt(prediction.maxWindSpeed) - actualData.maxWindSpeed);
    const windScore = Math.max(0, 250 - (windError * 5));
    score += windScore;
    
    // Pressure accuracy (200 points max)
    const pressureError = Math.abs(parseInt(prediction.minPressure) - actualData.minPressure);
    const pressureScore = Math.max(0, 200 - (pressureError * 10));
    score += pressureScore;
    
    // Category accuracy (150 points max)
    const categoryError = Math.abs(parseInt(prediction.peakCategory) - actualData.peakCategory);
    const categoryScore = categoryError === 0 ? 150 : Math.max(0, 100 - (categoryError * 25));
    score += categoryScore;
    
    // Timing accuracy (100 points max) - if provided
    if (prediction.landfallTime && actualData.landfallTime) {
        const predTime = new Date(prediction.landfallTime).getTime();
        const actualTime = new Date(actualData.landfallTime).getTime();
        const timeError = Math.abs(predTime - actualTime) / (1000 * 60 * 60); // hours
        const timeScore = Math.max(0, 100 - (timeError * 2));
        score += timeScore;
    }
    
    return Math.round(Math.min(score, maxScore));
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        predictionsCount: predictions.length,
        activeStormsCount: activeStorms.length
    });
});

// Adding Historical storm data for the 4 week rotation
const HISTORICAL_STORMS = {
  'irma-2017': {
    id: 'irma-2017',
    name: 'Hurricane Irma',
    year: 2017,
    startDate: '2017-08-30T06:00:00Z',
    actualLandfall: {
      lat: 25.0,
      lon: -80.9,
      time: '2017-09-10T13:00:00Z',
      category: 4,
      windSpeed: 130,
      pressure: 929
    },
    track: [
      { time: '2017-08-30T06:00:00Z', lat: 16.5, lon: -27.9, windSpeed: 35, pressure: 1008, category: 0 },
      { time: '2017-08-31T06:00:00Z', lat: 16.8, lon: -34.0, windSpeed: 75, pressure: 987, category: 1 },
      { time: '2017-09-01T06:00:00Z', lat: 16.8, lon: -40.8, windSpeed: 125, pressure: 950, category: 4 },
      { time: '2017-09-02T12:00:00Z', lat: 17.6, lon: -49.0, windSpeed: 160, pressure: 922, category: 5 },
      { time: '2017-09-03T18:00:00Z', lat: 18.6, lon: -57.0, windSpeed: 185, pressure: 914, category: 5 },
      { time: '2017-09-06T00:00:00Z', lat: 21.6, lon: -68.8, windSpeed: 185, pressure: 914, category: 5 },
      { time: '2017-09-08T06:00:00Z', lat: 26.9, lon: -75.3, windSpeed: 155, pressure: 929, category: 4 },
      { time: '2017-09-10T13:00:00Z', lat: 25.0, lon: -80.9, windSpeed: 130, pressure: 929, category: 4 }
    ]
  },
  'wilma-2005': {
    id: 'wilma-2005',
    name: 'Hurricane Wilma',
    year: 2005,
    startDate: '2005-10-15T06:00:00Z',
    actualLandfall: {
      lat: 26.0,
      lon: -81.5,
      time: '2005-10-24T10:30:00Z',
      category: 3,
      windSpeed: 120,
      pressure: 950
    },
    track: [
      { time: '2005-10-15T06:00:00Z', lat: 17.5, lon: -77.0, windSpeed: 35, pressure: 1006, category: 0 },
      { time: '2005-10-18T06:00:00Z', lat: 19.0, lon: -84.5, windSpeed: 80, pressure: 985, category: 1 },
      { time: '2005-10-19T00:00:00Z', lat: 19.2, lon: -85.0, windSpeed: 175, pressure: 882, category: 5 },
      { time: '2005-10-20T06:00:00Z', lat: 20.5, lon: -86.5, windSpeed: 150, pressure: 900, category: 4 },
      { time: '2005-10-22T06:00:00Z', lat: 22.0, lon: -85.0, windSpeed: 125, pressure: 950, category: 3 },
      { time: '2005-10-24T00:00:00Z', lat: 25.5, lon: -81.0, windSpeed: 120, pressure: 950, category: 3 },
      { time: '2005-10-24T10:30:00Z', lat: 26.0, lon: -81.5, windSpeed: 120, pressure: 950, category: 3 }
    ]
  },
  'ian-2022': {
    id: 'ian-2022',
    name: 'Hurricane Ian',
    year: 2022,
    startDate: '2022-09-23T06:00:00Z',
    actualLandfall: {
      lat: 26.6,
      lon: -82.3,
      time: '2022-09-28T19:05:00Z',
      category: 4,
      windSpeed: 150,
      pressure: 940
    },
    track: [
      { time: '2022-09-23T06:00:00Z', lat: 13.5, lon: -61.0, windSpeed: 35, pressure: 1005, category: 0 },
      { time: '2022-09-25T06:00:00Z', lat: 16.5, lon: -78.0, windSpeed: 65, pressure: 991, category: 0 },
      { time: '2022-09-26T06:00:00Z', lat: 17.8, lon: -81.5, windSpeed: 85, pressure: 980, category: 1 },
      { time: '2022-09-27T00:00:00Z', lat: 19.5, lon: -83.0, windSpeed: 120, pressure: 954, category: 3 },
      { time: '2022-09-27T12:00:00Z', lat: 20.8, lon: -83.5, windSpeed: 155, pressure: 937, category: 4 },
      { time: '2022-09-28T12:00:00Z', lat: 25.0, lon: -82.5, windSpeed: 155, pressure: 940, category: 4 },
      { time: '2022-09-28T19:05:00Z', lat: 26.6, lon: -82.3, windSpeed: 150, pressure: 940, category: 4 }
    ]
  },
  'harvey-2017': {
    id: 'harvey-2017',
    name: 'Hurricane Harvey',
    year: 2017,
    startDate: '2017-08-17T00:00:00Z',
    actualLandfall: {
      lat: 28.0,
      lon: -96.5,
      time: '2017-08-26T03:00:00Z',
      category: 4,
      windSpeed: 130,
      pressure: 937
    },
    track: [
      { time: '2017-08-17T00:00:00Z', lat: 11.5, lon: -35.0, windSpeed: 35, pressure: 1007, category: 0 },
      { time: '2017-08-18T06:00:00Z', lat: 12.5, lon: -44.0, windSpeed: 45, pressure: 1004, category: 0 },
      { time: '2017-08-23T06:00:00Z', lat: 22.0, lon: -92.0, windSpeed: 45, pressure: 1002, category: 0 },
      { time: '2017-08-24T06:00:00Z', lat: 24.5, lon: -94.5, windSpeed: 65, pressure: 994, category: 0 },
      { time: '2017-08-25T00:00:00Z', lat: 26.0, lon: -95.5, windSpeed: 110, pressure: 961, category: 2 },
      { time: '2017-08-25T18:00:00Z', lat: 27.5, lon: -96.0, windSpeed: 130, pressure: 938, category: 4 },
      { time: '2017-08-26T03:00:00Z', lat: 28.0, lon: -96.5, windSpeed: 130, pressure: 937, category: 4 }
    ]
  }
};

// Get the current week's storm based on date
function getCurrentWeekStorm() {
  // Calculate weeks since a reference date (e.g., Jan 1, 2025)
  const referenceDate = new Date('2025-01-01T00:00:00Z');
  const now = new Date();
  const weeksSinceReference = Math.floor((now - referenceDate) / (7 * 24 * 60 * 60 * 1000));
  
  const stormKeys = Object.keys(HISTORICAL_STORMS);
  const currentStormIndex = weeksSinceReference % stormKeys.length;
  const currentStormKey = stormKeys[currentStormIndex];
  
  return HISTORICAL_STORMS[currentStormKey];
}

// Simulate real-time progression through historical storm
function getSimulatedStormPosition(storm) {
  // Get current day of week (0 = Sunday, 1 = Monday, etc.)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hourOfDay = now.getHours();
  
  // Calculate how far through the week we are (0-1)
  const weekProgress = (dayOfWeek + hourOfDay / 24) / 7;
  
  // Map to position in track
  const trackIndex = Math.floor(weekProgress * storm.track.length);
  const currentPosition = storm.track[Math.min(trackIndex, storm.track.length - 1)];
  
  // Get historical track (up to current point)
  const historicalTrack = storm.track.slice(0, trackIndex + 1);
  
  // Get forecast track (remaining points)
  const forecastTrack = storm.track.slice(trackIndex);
  
  return {
    current: currentPosition,
    historical: historicalTrack,
    forecast: forecastTrack,
    weekProgress: (weekProgress * 100).toFixed(1),
    daysRemaining: 7 - dayOfWeek
  };
}

// New API endpoint for weekly storm
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
        nextStormChange: 'Monday 00:00 UTC',
        actualLandfall: currentStorm.actualLandfall
      }
    });
  } catch (error) {
    console.error('Error in weekly storm:', error);
    res.status(500).json({ error: 'Failed to get weekly storm' });
  }
});

// Start server
app.listen(PORT, () => {
    console.log(`🌀 Hurricane Prediction Game API running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
