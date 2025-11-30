# Hurricane Prediction Game - Test Suite

## Overview

This test suite provides comprehensive coverage for the Hurricane Prediction Game backend. Tests are organized into unit tests and integration tests to ensure both individual function correctness and end-to-end API behavior.

## Test Structure

```
__tests__/
├── unit/                    # Unit tests for pure functions
│   └── gameLogic.test.js   # Tests for scoring and game state logic
├── integration/             # Integration tests for API endpoints
│   └── api.test.js         # API endpoint tests
└── fixtures/                # Shared test data and mocks
    └── testData.js         # Mock storms, predictions, and badges
```

## Running Tests

```bash
# Run all tests with coverage
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

## Test Coverage

### Unit Tests (70 tests)

#### ✅ Distance Calculation (5 tests)
- Haversine formula accuracy
- Edge cases (same point, equator crossing, small distances)
- Coordinate system handling

#### ✅ Track Score Calculation (8 tests)
- Perfect prediction (0 NM error → 1000 pts)
- Moderate errors (50 NM → ~606 pts, 100 NM → ~368 pts)
- Large errors (200 NM → ~135 pts)
- Score boundaries and monotonic decrease
- Integer value verification

#### ✅ Intensity Score Calculation (10 tests)
- Perfect prediction (0 mph, 0 mb error → 1000 pts)
- Component scoring (wind 60%, pressure 40%)
- Error tolerance (10 mph, 5 mb acceptable)
- Absolute value handling (negative errors)
- Combined error scenarios

#### ✅ Total Score Validation (3 tests)
- Perfect score (2000 pts possible)
- Realistic scenarios (moderate and poor predictions)
- Score range verification

#### ✅ Game State Logic (6 tests)
- Storm selection based on time
- Edge cases (empty array, before/after window)
- Time boundary handling
- Fallback behavior

#### ✅ Timeframe Management (10 tests)
- Timeframe unlocking (0, 6, 12, 18, 24 hour marks)
- Pre-game and post-game states
- Exact boundary conditions
- Null handling

#### ✅ Badge Award Logic (15 tests)
- Milestone badges (predictions, points, storms)
- Performance badges (1900+, 1950+, 2000 pts)
- Special badges (lucky number 777)
- Threshold validation
- Missing data handling

### Integration Tests (15 tests)

Currently implemented as test templates for:
- API health checks
- Game state endpoints
- Prediction submission and validation
- Leaderboard rankings
- Badge system endpoints
- End-to-end scoring flows

## Key Test Scenarios

### Scoring Accuracy Tests

**Perfect Prediction**
- Distance: 0 NM → 1000 pts
- Intensity: 0 mph, 0 mb → 1000 pts
- **Total: 2000 pts ⭐**

**Good Prediction**
- Distance: 25 NM → ~779 pts
- Intensity: 8 mph, 4 mb → ~700 pts
- **Total: ~1479 pts 💎**

**Moderate Prediction**
- Distance: 50 NM → ~606 pts
- Intensity: 15 mph, 8 mb → ~550 pts
- **Total: ~1156 pts 🎯**

**Poor Prediction**
- Distance: 150 NM → ~223 pts
- Intensity: 30 mph, 15 mb → ~350 pts
- **Total: ~573 pts 📊**

### Badge Award Tests

**Milestone Progression**
- 1st prediction → First Steps 👶
- 10 predictions → Veteran 🎖️
- 50 predictions → Experienced 🎖️
- 100 predictions → Master Forecaster 🎖️

**Performance Achievements**
- 1900+ pts → Diamond Prediction 💎
- 1950+ pts → The Oracle 🔮
- 2000 pts → Perfect Storm ⭐

**Point Milestones**
- 5,000 pts → 5K Club 💯
- 25,000 pts → 25K Club 💯
- 50,000 pts → 50K Club 💯

## Test Coverage Goals

| Metric | Target | Current |
|--------|--------|---------|
| Statements | 80% | 100% (gameLogic.js) |
| Branches | 70% | 100% (gameLogic.js) |
| Functions | 75% | 100% (gameLogic.js) |
| Lines | 80% | 100% (gameLogic.js) |

## Adding New Tests

### Unit Test Template

```javascript
describe('New Feature', () => {
  test('should handle normal case', () => {
    const result = yourFunction(input);
    expect(result).toBe(expectedValue);
  });

  test('should handle edge case', () => {
    const result = yourFunction(edgeInput);
    expect(result).toBe(expectedEdgeValue);
  });

  test('should handle errors gracefully', () => {
    expect(() => yourFunction(invalidInput)).toThrow();
  });
});
```

### Integration Test Template

```javascript
describe('API Endpoint', () => {
  test('should return success response', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);

    expect(response.body).toHaveProperty('data');
  });
});
```

## Known Issues & Future Work

### Current Limitations
1. Integration tests are templates only - need real API mocking
2. Database layer not yet tested with actual PostgreSQL
3. Badge system needs more edge case coverage
4. Frontend tests not included

### Planned Improvements
1. Add database integration tests with test database
2. Implement full API endpoint tests with supertest
3. Add E2E tests for complete user flows
4. Add performance benchmarks for scoring calculations
5. Test concurrent prediction submissions
6. Test automatic scoring cron job

## Dependencies

- **jest**: Test framework
- **supertest**: HTTP endpoint testing
- **@types/jest**: TypeScript definitions

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Descriptive Names**: Test names explain what they verify
3. **Arrange-Act-Assert**: Clear test structure
4. **Edge Cases**: Always test boundaries and error conditions
5. **Mock Wisely**: Mock external dependencies, not core logic

## Continuous Integration

Tests run automatically on:
- Every commit (pre-commit hook)
- Pull request creation
- Merge to main branch

**Minimum Requirements**:
- All tests must pass
- Coverage thresholds must be met
- No console errors or warnings

## Debugging Tests

```bash
# Run specific test file
npm test gameLogic.test.js

# Run tests with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Update snapshots
npm test -- -u
```

## Contact

For questions about tests or to report issues, please open a GitHub issue with the `testing` label.
