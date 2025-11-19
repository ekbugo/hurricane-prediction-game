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

// Start server
app.listen(PORT, () => {
    console.log(`🌀 Hurricane Prediction Game API running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
