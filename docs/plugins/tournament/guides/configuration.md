# Configuration

> **In this guide:** All configuration options, tournament formats, resource schemas, and API reference.

**Navigation:** [← Back to Tournament Plugin](../README.md)

---

## Plugin Options

```javascript
new TournamentPlugin({
  resourceNames: {
    tournaments: 'tournaments',
    matches: 'matches',
    registrations: 'registrations'
  }
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resourceNames.tournaments` | string | `'tournaments'` | Resource for tournament records |
| `resourceNames.matches` | string | `'matches'` | Resource for match records |
| `resourceNames.registrations` | string | `'registrations'` | Resource for registration records |

---

## Tournament Formats

### Single Elimination

Standard bracket where loser is eliminated immediately.

```javascript
const tournament = await plugin.create({
  name: 'Championship',
  format: 'single-elimination',
  config: {
    bestOf: 3,           // Best of 3 series
    thirdPlaceMatch: true // Include 3rd place match
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bestOf` | number | `1` | Games per match (1, 3, 5, 7) |
| `thirdPlaceMatch` | boolean | `false` | Include 3rd place decider |

### Double Elimination

Two brackets (winners/losers). Must lose twice to be eliminated.

```javascript
const tournament = await plugin.create({
  name: 'Championship',
  format: 'double-elimination',
  config: {
    bestOf: 3,
    grandFinalReset: true // Loser bracket winner can reset bracket
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bestOf` | number | `1` | Games per match |
| `grandFinalReset` | boolean | `true` | Allow bracket reset in grand final |

### Round Robin

Everyone plays everyone. Best for league formats.

```javascript
const tournament = await plugin.create({
  name: 'League',
  format: 'round-robin',
  config: {
    rounds: 2,       // Double round robin (home/away)
    pointsWin: 3,    // Points for win
    pointsDraw: 1,   // Points for draw
    pointsLoss: 0    // Points for loss
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rounds` | number | `1` | 1=single, 2=double round robin |
| `pointsWin` | number | `3` | Points awarded for win |
| `pointsDraw` | number | `1` | Points awarded for draw |
| `pointsLoss` | number | `0` | Points awarded for loss |

### Swiss System

Non-elimination format. Players with similar records face each other.

```javascript
const tournament = await plugin.create({
  name: 'Swiss Tournament',
  format: 'swiss',
  config: {
    rounds: 5,          // Number of rounds
    advanceWins: 3,     // Wins needed to advance (optional)
    eliminateLosses: 3  // Losses to eliminate (optional)
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rounds` | number | required | Number of Swiss rounds |
| `advanceWins` | number | `null` | Auto-advance after N wins |
| `eliminateLosses` | number | `null` | Auto-eliminate after N losses |

### Group Stage

Groups followed by elimination playoffs.

```javascript
const tournament = await plugin.create({
  name: 'World Cup',
  format: 'group-stage',
  config: {
    groupSize: 4,        // Teams per group
    advancePerGroup: 2,  // Top N advance to playoffs
    playoffFormat: 'single-elimination'
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupSize` | number | `4` | Participants per group |
| `advancePerGroup` | number | `2` | Top N advance to playoffs |
| `playoffFormat` | string | `'single-elimination'` | Playoff bracket format |

### League with Playoffs

Long-running season with playoff bracket.

```javascript
const tournament = await plugin.create({
  name: 'Premier League',
  format: 'league-playoffs',
  config: {
    seasonLength: 38,    // Number of matchdays
    playoffTeams: 4,     // Top N make playoffs
    promotionCount: 2,   // Teams promoted (multi-tier)
    relegationCount: 2   // Teams relegated
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `seasonLength` | number | required | Number of matchdays |
| `playoffTeams` | number | `4` | Teams qualifying for playoffs |
| `promotionCount` | number | `0` | Teams promoted |
| `relegationCount` | number | `0` | Teams relegated |

### Ladder

Dynamic ranking system with challenges.

```javascript
const tournament = await plugin.create({
  name: 'Ranked Ladder',
  format: 'ladder',
  config: {
    challengeRange: 5,   // Can challenge up to N ranks above
    inactivityDays: 14   // Days before rank decay
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `challengeRange` | number | `3` | Max ranks above to challenge |
| `inactivityDays` | number | `14` | Days before inactivity penalty |

### Circuit

Series of tournaments with cumulative points.

```javascript
const tournament = await plugin.create({
  name: 'Pro Circuit 2024',
  format: 'circuit',
  config: {
    pointSystem: {
      1: 100,  // 1st place
      2: 75,   // 2nd place
      3: 50,   // 3rd place
      4: 25    // 4th place
    },
    events: 5  // Number of circuit events
  }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pointSystem` | object | required | Points per placement |
| `events` | number | required | Number of circuit events |

---

## Created Resources

### Tournaments Resource

```javascript
{
  id: 'string|required',
  name: 'string|required',
  organizerId: 'string|required',
  format: 'string|required',      // 'single-elimination', 'round-robin', etc.
  participantType: 'string',      // 'user' or 'team'
  status: 'string',               // 'draft', 'registration', 'in-progress', 'completed', 'cancelled'
  config: 'object',               // Format-specific configuration
  bracketData: 'object|optional', // Generated bracket structure
  createdAt: 'timestamp',
  startedAt: 'timestamp|optional',
  completedAt: 'timestamp|optional'
}
```

### Matches Resource

```javascript
{
  id: 'string|required',
  tournamentId: 'string|required',
  round: 'number|required',
  matchNumber: 'number|required',
  participant1Id: 'string|optional',
  participant2Id: 'string|optional',
  score1: 'number|optional',
  score2: 'number|optional',
  winnerId: 'string|optional',
  status: 'string',               // 'pending', 'scheduled', 'in-progress', 'completed', 'walkover'
  scheduledAt: 'timestamp|optional',
  completedAt: 'timestamp|optional',
  games: 'array|optional',        // Individual game scores for Bo3/Bo5
  metadata: 'object|optional'
}
```

### Registrations Resource

```javascript
{
  id: 'string|required',
  tournamentId: 'string|required',
  participantId: 'string|required',
  status: 'string',               // 'pending', 'confirmed', 'checked-in', 'withdrawn'
  seed: 'number|optional',
  registeredAt: 'timestamp',
  checkedInAt: 'timestamp|optional',
  metadata: 'object|optional'
}
```

---

## API Reference

### Tournament Management

```javascript
// Create tournament
const tournament = await plugin.create({
  name: 'string',
  organizerId: 'string',
  format: 'string',
  participantType: 'user' | 'team',
  config: { ... }
});

// Get tournament
const tournament = await plugin.get(tournamentId);

// Update tournament
await plugin.update(tournamentId, { name: 'New Name' });

// Delete tournament (cascades to matches and registrations)
await plugin.delete(tournamentId);

// List tournaments
const tournaments = await plugin.list({
  status: 'in-progress',
  organizerId: 'org-123',
  format: 'round-robin'
});
```

### Lifecycle Control

```javascript
// Open registration
await plugin.openRegistration(tournamentId);

// Close registration
await plugin.closeRegistration(tournamentId);

// Start tournament (generates bracket)
await plugin.startTournament(tournamentId);

// Cancel tournament
await plugin.cancel(tournamentId, 'Reason for cancellation');

// Complete tournament (called automatically when final match ends)
await plugin.complete(tournamentId);
```

### Registration Operations

```javascript
// Register participant
await plugin.register(tournamentId, participantId, {
  metadata: { teamName: 'Alpha Squad' }
});

// Confirm registration (if using review process)
await plugin.confirmRegistration(tournamentId, participantId);

// Check in participant
await plugin.checkIn(tournamentId, participantId);

// Withdraw participant
await plugin.withdraw(tournamentId, participantId);

// Set seed
await plugin.setSeed(tournamentId, participantId, 1); // #1 seed

// Shuffle remaining seeds
await plugin.shuffleSeeds(tournamentId);

// Get registrations
const registrations = await plugin.getRegistrations(tournamentId, {
  status: 'confirmed'
});
```

### Match Operations

```javascript
// Get matches
const matches = await plugin.getMatches(tournamentId, {
  status: 'pending',
  round: 1
});

// Get specific match
const match = await plugin.getMatch(matchId);

// Schedule match
await plugin.scheduleMatch(matchId, startTimeTimestamp);

// Report result
await plugin.reportResult(matchId, {
  score1: 2,
  score2: 1,
  winnerId: 'participant-1',
  games: [
    { score1: 16, score2: 14 },
    { score1: 12, score2: 16 },
    { score1: 16, score2: 10 }
  ],
  metadata: { demoUrl: 'https://...' }
});

// Report walkover
await plugin.reportWalkover(matchId, winnerId, 'Opponent no-show');
```

### Standings & Bracket

```javascript
// Get standings/leaderboard
const standings = await plugin.getStandings(tournamentId);
// Returns: [{ participantId, rank, points, wins, losses, ... }]

// Get bracket structure (for visualization)
const bracket = await plugin.getBracket(tournamentId);
// Returns: { rounds: [...], matches: [...] }
```

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Tournament lifecycle, real-world examples
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ

