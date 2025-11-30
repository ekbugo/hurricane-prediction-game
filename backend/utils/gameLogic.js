/**
 * Game Logic Utilities
 * Pure functions for hurricane prediction game calculations
 */

/**
 * Calculate great-circle distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in nautical miles
 */
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

/**
 * Calculate Track Score (0-1000 pts based on distance error)
 * @param {number} distanceErrorNM - Distance error in nautical miles
 * @returns {number} Score from 0 to 1000
 */
function calculateTrackScore(distanceErrorNM) {
  // Exponential decay: heavily penalize distance errors
  // 0 NM = 1000 pts, 50 NM = ~600 pts, 100 NM = ~368 pts, 200 NM = ~135 pts
  const score = 1000 * Math.exp(-0.01 * distanceErrorNM);
  return Math.round(Math.max(0, score));
}

/**
 * Calculate Intensity Score (0-1000 pts based on wind + pressure errors)
 * @param {number} windError - Wind speed error in mph
 * @param {number} pressureError - Pressure error in mb
 * @returns {number} Score from 0 to 1000
 */
function calculateIntensityScore(windError, pressureError) {
  // Weight: winds are harder to predict than pressure
  // Wind contributes 60%, pressure 40%
  const windScore = 600 * Math.exp(-0.02 * Math.abs(windError));
  const pressureScore = 400 * Math.exp(-0.05 * Math.abs(pressureError));
  const totalScore = windScore + pressureScore;
  return Math.round(Math.max(0, totalScore));
}

/**
 * Get current active storm based on time rotation
 * @param {Array} historicalStorms - Array of storm objects
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {Object|null} Active storm or null if none active
 */
function getCurrentStorm(historicalStorms, currentTime = new Date()) {
  if (!historicalStorms || historicalStorms.length === 0) return null;

  const now = currentTime;

  // Find which storm should be active based on gameStart times
  for (const storm of historicalStorms) {
    const stormStart = new Date(storm.gameStart);
    const stormEnd = new Date(storm.gameEnd);

    if (now >= stormStart && now < stormEnd) {
      return storm;
    }
  }

  // If no storm matches, return the first one as fallback
  return historicalStorms[0];
}

/**
 * Determine which timeframe is currently active for a storm
 * @param {Object} storm - Storm object with gameStart and timeframes
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {string|null} Active timeframe ('0600', '1200', '1800', '0000') or null
 */
function getActiveTimeframe(storm, currentTime = new Date()) {
  if (!storm || !storm.timeframes) return null;

  const now = currentTime;
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

/**
 * Check if a badge should be awarded based on criteria
 * @param {Object} stats - User statistics
 * @param {string} badgeId - Badge identifier
 * @returns {boolean} Whether badge should be awarded
 */
function shouldAwardBadge(stats, badgeId) {
  const {
    totalPredictions = 0,
    totalScore = 0,
    uniqueStorms = 0,
    currentScore = 0
  } = stats;

  // Milestone badges - predictions
  if (badgeId === 'first_prediction' && totalPredictions === 1) return true;
  if (badgeId === 'veteran_10' && totalPredictions === 10) return true;
  if (badgeId === 'veteran_50' && totalPredictions === 50) return true;
  if (badgeId === 'veteran_100' && totalPredictions === 100) return true;
  if (badgeId === 'veteran_500' && totalPredictions === 500) return true;

  // Milestone badges - points
  if (badgeId === 'points_5k' && totalScore >= 5000) return true;
  if (badgeId === 'points_25k' && totalScore >= 25000) return true;
  if (badgeId === 'points_50k' && totalScore >= 50000) return true;
  if (badgeId === 'points_100k' && totalScore >= 100000) return true;

  // Milestone badges - storms
  if (badgeId === 'storm_survivor_5' && uniqueStorms === 5) return true;
  if (badgeId === 'storm_survivor_12' && uniqueStorms === 12) return true;

  // Performance badges - score based
  if (badgeId === 'diamond_prediction' && currentScore >= 1900) return true;
  if (badgeId === 'oracle' && currentScore >= 1950) return true;
  if (badgeId === 'perfect_storm' && currentScore === 2000) return true;

  // Lucky number badge
  if (badgeId === 'lucky_number' && currentScore.toString().endsWith('777')) return true;

  return false;
}

module.exports = {
  calculateDistance,
  calculateTrackScore,
  calculateIntensityScore,
  getCurrentStorm,
  getActiveTimeframe,
  shouldAwardBadge
};
