/**
 * Test Fixtures and Mock Data
 * Reusable test data for unit and integration tests
 */

const mockStorms = [
  {
    id: 'katrina-2005',
    name: 'Katrina',
    year: 2005,
    gameStart: '2024-01-01T06:00:00.000Z',
    gameEnd: '2024-01-02T06:00:00.000Z',
    timeframes: [
      {
        timeframe: '0000',
        type: 'base',
        lat: 25.4,
        lon: -80.3,
        windSpeed: 80,
        pressure: 986,
        category: 1
      },
      {
        timeframe: '0600',
        type: 'prediction',
        lat: 26.1,
        lon: -81.5,
        windSpeed: 100,
        pressure: 960,
        category: 3
      },
      {
        timeframe: '1200',
        type: 'prediction',
        lat: 27.2,
        lon: -83.4,
        windSpeed: 115,
        pressure: 950,
        category: 4
      },
      {
        timeframe: '1800',
        type: 'prediction',
        lat: 28.8,
        lon: -85.9,
        windSpeed: 125,
        pressure: 942,
        category: 4
      },
      {
        timeframe: '0000',
        type: 'prediction',
        lat: 29.5,
        lon: -89.6,
        windSpeed: 140,
        pressure: 920,
        category: 5
      }
    ]
  },
  {
    id: 'andrew-1992',
    name: 'Andrew',
    year: 1992,
    gameStart: '2024-01-02T06:00:00.000Z',
    gameEnd: '2024-01-03T06:00:00.000Z',
    timeframes: [
      {
        timeframe: '0000',
        type: 'base',
        lat: 25.5,
        lon: -78.2,
        windSpeed: 50,
        pressure: 1005,
        category: 0
      },
      {
        timeframe: '0600',
        type: 'prediction',
        lat: 25.8,
        lon: -79.8,
        windSpeed: 90,
        pressure: 975,
        category: 2
      },
      {
        timeframe: '1200',
        type: 'prediction',
        lat: 25.5,
        lon: -80.3,
        windSpeed: 145,
        pressure: 922,
        category: 5
      },
      {
        timeframe: '1800',
        type: 'prediction',
        lat: 26.1,
        lon: -81.2,
        windSpeed: 150,
        pressure: 920,
        category: 5
      },
      {
        timeframe: '0000',
        type: 'prediction',
        lat: 26.7,
        lon: -82.5,
        windSpeed: 120,
        pressure: 945,
        category: 4
      }
    ]
  }
];

const mockPredictions = [
  {
    username: 'testuser1',
    stormId: 'katrina-2005',
    timeframe: '0600',
    predictedLat: 26.0,
    predictedLon: -81.4,
    predictedWindSpeed: 98,
    predictedPressure: 962
  },
  {
    username: 'testuser1',
    stormId: 'katrina-2005',
    timeframe: '1200',
    predictedLat: 27.3,
    predictedLon: -83.5,
    predictedWindSpeed: 118,
    predictedPressure: 948
  },
  {
    username: 'testuser2',
    stormId: 'katrina-2005',
    timeframe: '0600',
    predictedLat: 25.5,
    predictedLon: -80.8,
    predictedWindSpeed: 105,
    predictedPressure: 955
  }
];

const mockBadgeDefinitions = [
  {
    badge_id: 'first_prediction',
    name: 'First Steps',
    description: 'Submit your first prediction',
    category: 'milestone',
    tier: 'bronze',
    icon: '👶',
    points_value: 50
  },
  {
    badge_id: 'veteran_10',
    name: 'Veteran',
    description: 'Submit 10 predictions',
    category: 'milestone',
    tier: 'bronze',
    icon: '🎖️',
    points_value: 100
  },
  {
    badge_id: 'diamond_prediction',
    name: 'Diamond Prediction',
    description: 'Score 1900+ points on a single prediction',
    category: 'performance',
    tier: 'diamond',
    icon: '💎',
    points_value: 1000
  },
  {
    badge_id: 'perfect_storm',
    name: 'Perfect Storm',
    description: 'Score exactly 2000 points',
    category: 'performance',
    tier: 'diamond',
    icon: '⭐',
    points_value: 5000
  }
];

const validPredictionPayload = {
  username: 'testuser',
  stormId: 'katrina-2005',
  timeframe: '0600',
  lat: 26.0,
  lon: -81.5,
  windSpeed: 100,
  pressure: 960
};

const invalidPredictionPayloads = {
  missingUsername: {
    stormId: 'katrina-2005',
    timeframe: '0600',
    lat: 26.0,
    lon: -81.5,
    windSpeed: 100,
    pressure: 960
  },
  missingCoordinates: {
    username: 'testuser',
    stormId: 'katrina-2005',
    timeframe: '0600',
    windSpeed: 100,
    pressure: 960
  },
  invalidTypes: {
    username: 'testuser',
    stormId: 'katrina-2005',
    timeframe: '0600',
    lat: 'invalid',
    lon: -81.5,
    windSpeed: 100,
    pressure: 960
  }
};

module.exports = {
  mockStorms,
  mockPredictions,
  mockBadgeDefinitions,
  validPredictionPayload,
  invalidPredictionPayloads
};
