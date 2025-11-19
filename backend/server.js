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

// Historical storm data for weekly rotation
const HISTORICAL_STORMS = [
  {
    id: 'irma-2017',
    name: 'Hurricane Irma',
    year: 2017,
    actualLandfall: { lat: 25.0, lon: -80.9, time: '2017-09-10T13:00:00Z', category: 4, windSpeed: 130, pressure: 929 },
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
  {
    id: 'wilma-2005',
    name: 'Hurricane Wilma',
    year: 2005,
    actualLandfall: { lat: 26.0, lon: -81.5, time: '2005-10-24T10:30:00Z', category: 3, windSpeed: 120, pressure: 950 },
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
  {
    id: 'ian-2022',
    name: 'Hurricane Ian',
    year: 2022,
    actualLandfall: { lat: 26.6, lon: -82.3, time: '2022-09-28T19:05:00Z', category: 4, windSpeed: 150, pressure: 940 },
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
  {
    id: 'harvey-2017',
    name: 'Hurricane Harvey',
    year: 2017,
    actualLandfall: { lat: 28.0, lon: -96.5, time: '2017-08-26T03:00:00Z', category: 4, windSpeed: 130, pressure: 937 },
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
];

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
