# 🏆 Tournament Plugin

> Comprehensive tournament management for competitive gaming and sports.

## TLDR

```javascript
import { Database, TournamentPlugin } from 's3db.js';

const db = new Database({ connectionString: 'memory://test/db' });
await db.connect();

const tournament = new TournamentPlugin();
await db.usePlugin(tournament, 'tournament');

// Create a CS2 Major
const major = await tournament.create({
  name: 'CS2 Major 2025',
  organizerId: 'esl-123',
  format: 'swiss',
  participantType: 'team',
  config: { swissRounds: 5, bestOf: 3 }
});

// Register teams
await tournament.openRegistration(major.id);
await tournament.register(major.id, 'navi');
await tournament.register(major.id, 'faze');
// ...

// Start and play
await tournament.startTournament(major.id);
const matches = await tournament.getMatches(major.id);
await tournament.reportResult(matches[0].id, { score1: 2, score2: 1 });
```

## Supported Formats

| Format | Type | Description | Use Case |
|--------|------|-------------|----------|
| `round-robin` | League | All vs all | LCS, Brasileirão |
| `single-elimination` | Bracket | Lose once, out | FA Cup, playoffs |
| `double-elimination` | Bracket | Lose twice, out | Dota TI, FGC |
| `swiss` | Hybrid | Similar records face off | CS2 Majors, card games |
| `group-stage` | Groups | Round-robin or GSL groups | Champions League |
| `league-playoffs` | Hybrid | Regular season + playoffs | NBA, VCT |
| `ladder` | Ranking | Challenge-based ranking | FGC, ranked |
| `circuit` | Points | Cumulative points | F1, ATP |
| `promotion-relegation` | Multi-tier | Divisions with movement | Football leagues |

## Table of Contents

1. [Quickstart](#quickstart)
2. [Configuration](#configuration)
3. [Tournament Lifecycle](#tournament-lifecycle)
4. [Format-Specific Features](#format-specific-features)
5. [API Reference](#api-reference)
6. [Events](#events)
7. [Best Practices](#best-practices)
8. [FAQ](#faq)

---

## Quickstart

### Installation

```javascript
import { Database, TournamentPlugin } from 's3db.js';

const db = new Database({ connectionString: 'http://...' });
await db.connect();

const tournament = new TournamentPlugin({
  logLevel: 'info'
});

await db.usePlugin(tournament, 'tournament');
```

### Complete Example

```javascript
// 1. Create tournament
const tourney = await tournament.create({
  name: 'Weekend Showdown',
  organizerId: 'my-org-id',
  format: 'single-elimination',
  participantType: 'team',
  participantResource: 'teams_v1', // Optional: external resource
  config: {
    bestOf: 3,
    finalsBestOf: 5,
    thirdPlaceMatch: true
  }
});

// 2. Open registration
await tournament.openRegistration(tourney.id);

// 3. Register participants
await tournament.register(tourney.id, 'team-alpha');
await tournament.register(tourney.id, 'team-beta');
await tournament.register(tourney.id, 'team-gamma');
await tournament.register(tourney.id, 'team-delta');

// 4. Confirm registrations
await tournament.confirmRegistration(tourney.id, 'team-alpha');
// ... confirm others

// 5. Set seeds (optional)
await tournament.setSeed(tourney.id, 'team-alpha', 1);
await tournament.setSeed(tourney.id, 'team-beta', 2);
// Or shuffle randomly
await tournament.shuffleSeeds(tourney.id);

// 6. Start tournament
await tournament.startTournament(tourney.id);

// 7. Get and play matches
const matches = await tournament.getMatches(tourney.id, { status: 'pending' });
for (const match of matches) {
  await tournament.reportResult(match.id, {
    score1: 2,
    score2: 1,
    games: [
      { score1: 16, score2: 14 },
      { score1: 12, score2: 16 },
      { score1: 16, score2: 8 }
    ]
  });
}

// 8. Get standings
const standings = await tournament.getStandings(tourney.id);
console.log('Winner:', standings[0].participantId);
```

---

## Configuration

### Plugin Options

```javascript
const tournament = new TournamentPlugin({
  logLevel: 'info',              // 'silent', 'debug', 'info', 'warn', 'error'
  namespace: 'production',       // Optional: namespace isolation
  resourceNames: {
    tournaments: 'my_tournaments',     // Override default resource name
    matches: 'my_matches',
    registrations: 'my_registrations'
  }
});
```

### Format Configurations

#### Round Robin
```javascript
{
  format: 'round-robin',
  config: {
    rounds: 2,          // 1 = single, 2 = double (turno/returno)
    bestOf: 1,
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    tiebreaker: 'goal-difference' // 'goal-difference', 'head-to-head', 'goals-scored'
  }
}
```

#### Single Elimination
```javascript
{
  format: 'single-elimination',
  config: {
    bestOf: 3,
    finalsBestOf: 5,
    thirdPlaceMatch: true,
    seedingStrategy: 'bracket' // 'bracket', 'random', 'manual'
  }
}
```

#### Double Elimination
```javascript
{
  format: 'double-elimination',
  config: {
    bestOf: 3,
    grandFinalsBestOf: 5,
    grandFinalsReset: true // If losers bracket winner wins, play a second set
  }
}
```

#### Swiss System
```javascript
{
  format: 'swiss',
  config: {
    rounds: 5,
    bestOf: 3,
    advanceWins: 3,      // 3-0, 3-1, 3-2 advances
    eliminateLosses: 3,  // 0-3, 1-3, 2-3 eliminated
    avoidRematches: true,
    buchholzTiebreaker: true
  }
}
```

#### Group Stage
```javascript
{
  format: 'group-stage',
  config: {
    groupCount: 4,
    participantsPerGroup: 4,
    style: 'gsl',        // 'round-robin' or 'gsl'
    advanceCount: 2,     // Top 2 from each group
    seedingStrategy: 'snake'
  }
}
```

#### League + Playoffs
```javascript
{
  format: 'league-playoffs',
  config: {
    // League phase
    leagueRounds: 2,
    leagueBestOf: 1,
    pointsWin: 3,

    // Playoffs phase
    playoffsFormat: 'double-elimination',
    playoffsSize: 8,
    playoffsBestOf: 5,
    byesForTopSeeds: 2
  }
}
```

#### Ladder
```javascript
{
  format: 'ladder',
  config: {
    bestOf: 3,
    initialRating: 1000,
    kFactor: 32,
    challengeRange: 5,         // Can challenge up to 5 spots above
    challengeCooldown: 86400000, // 24h cooldown
    protectionPeriod: 86400000   // 24h protection after defending
  }
}
```

#### Circuit
```javascript
{
  format: 'circuit',
  config: {
    pointsTable: {
      1: 100, 2: 75, 3: 50, 4: 40, 5: 32, 6: 24, 7: 18, 8: 12
    },
    eventTiers: {
      major: 2.0,
      premier: 1.5,
      standard: 1.0
    },
    countBestN: 10,    // Only count top 10 results
    qualifyTop: 8      // Top 8 qualify for finals
  }
}
```

#### Promotion/Relegation
```javascript
{
  format: 'promotion-relegation',
  config: {
    divisions: 3,
    teamsPerDivision: 10,
    rounds: 2,
    promotionSpots: 2,
    relegationSpots: 2,
    playoffSpots: 1
  }
}
```

---

## Tournament Lifecycle

```
draft → registration → registration-closed → in-progress → completed
                ↓                                              ↓
            cancelled                                      cancelled
```

### Status Transitions

| From | To | Method |
|------|-----|--------|
| `draft` | `registration` | `openRegistration()` |
| `registration` | `registration-closed` | `closeRegistration()` |
| `registration` / `registration-closed` | `in-progress` | `start()` |
| `in-progress` | `completed` | Auto or `complete()` |
| Any (except completed) | `cancelled` | `cancel()` |

---

## Format-Specific Features

### Ladder Commands

```javascript
// Create a challenge
const match = await tournament.challenge(tournamentId, 'challenger-id', 'defender-id');

// Get ladder rankings
const rankings = await tournament.getLadderRanking(tournamentId);
```

### Circuit Commands

```javascript
// Add event results to circuit
await tournament.addCircuitEvent(circuitId, {
  id: 'event-123',
  name: 'Major #1',
  tier: 'major',
  results: [
    { participantId: 'team-a', placement: 1 },
    { participantId: 'team-b', placement: 2 },
    // ...
  ]
});

// Get circuit standings
const standings = await tournament.getCircuitStandings(circuitId);
```

### Promotion/Relegation Commands

```javascript
// Get divisions
const divisions = await tournament.getDivisions(tournamentId);

// Get promotion zone
const promotionZone = await tournament.getPromotionZone(tournamentId, 2);

// Get relegation zone
const relegationZone = await tournament.getRelegationZone(tournamentId, 1);
```

---

## API Reference

### Tournament Management

| Method | Description |
|--------|-------------|
| `create(options)` | Create a new tournament |
| `get(id)` | Get tournament by ID |
| `update(id, data)` | Update tournament |
| `delete(id)` | Delete tournament |
| `list(filters)` | List tournaments |

### Lifecycle

| Method | Description |
|--------|-------------|
| `openRegistration(id)` | Open registration |
| `closeRegistration(id)` | Close registration |
| `startTournament(id)` | Start tournament |
| `cancel(id, reason)` | Cancel tournament |
| `complete(id)` | Complete tournament |

### Registration

| Method | Description |
|--------|-------------|
| `register(tournamentId, participantId, options)` | Register participant |
| `confirmRegistration(tournamentId, participantId)` | Confirm registration |
| `checkIn(tournamentId, participantId)` | Check-in participant |
| `withdraw(tournamentId, participantId, reason)` | Withdraw participant |
| `getParticipants(tournamentId)` | Get all participants |
| `setSeed(tournamentId, participantId, seed)` | Set participant seed |
| `shuffleSeeds(tournamentId)` | Randomize seeds |

### Matches

| Method | Description |
|--------|-------------|
| `getMatches(tournamentId, filters)` | Get matches |
| `getMatch(matchId)` | Get single match |
| `scheduleMatch(matchId, scheduledAt)` | Schedule match |
| `startMatch(matchId)` | Start match |
| `reportResult(matchId, result)` | Report result |
| `reportWalkover(matchId, winnerId, reason)` | Report walkover |
| `reportGame(matchId, game)` | Report game in Bo series |
| `getUpcomingMatches(tournamentId, limit)` | Get upcoming matches |
| `getLiveMatches(tournamentId)` | Get live matches |

### Standings & Bracket

| Method | Description |
|--------|-------------|
| `getStandings(tournamentId)` | Get current standings |
| `getBracket(tournamentId)` | Get bracket structure |

### Utilities

| Method | Description |
|--------|-------------|
| `getAvailableFormats()` | List available formats |
| `getFormatMetadata()` | Get format info |
| `getStats()` | Get plugin statistics |

---

## Events

```javascript
tournament.on('plg:tournament:created', ({ tournament }) => { });
tournament.on('plg:tournament:started', ({ tournamentId, participantCount }) => { });
tournament.on('plg:tournament:completed', ({ tournamentId, winner, standings }) => { });
tournament.on('plg:tournament:cancelled', ({ tournamentId, reason }) => { });

tournament.on('plg:tournament:participant-registered', ({ tournamentId, participantId }) => { });
tournament.on('plg:tournament:participant-withdrawn', ({ tournamentId, participantId }) => { });

tournament.on('plg:tournament:match-scheduled', ({ matchId, scheduledAt }) => { });
tournament.on('plg:tournament:match-started', ({ matchId, participant1Id, participant2Id }) => { });
tournament.on('plg:tournament:match-completed', ({ matchId, winnerId, score1, score2 }) => { });
tournament.on('plg:tournament:match-walkover', ({ matchId, winnerId, reason }) => { });

tournament.on('plg:tournament:bracket-updated', ({ tournamentId, newMatchCount }) => { });
tournament.on('plg:tournament:standings-updated', ({ tournamentId, standings }) => { });
```

---

## Best Practices

### Do's

- Always confirm registrations before starting
- Use appropriate `bestOf` for your format (Bo1 for groups, Bo3/Bo5 for playoffs)
- Set seeds for competitive integrity
- Handle walkovers for no-shows
- Listen to events for real-time updates

### Don'ts

- Don't modify format after tournament starts
- Don't delete tournaments in progress
- Don't report results for matches with missing participants
- Don't use extremely large `challengeRange` in ladder format

---

## FAQ

### How do I handle ties?

Round-robin formats support `allowDraws: true` (default). For elimination formats, ensure `bestOf` is odd.

### Can participants be from an external resource?

Yes! Set `participantResource` to reference your existing teams/players resource. The plugin only stores participant IDs.

### How does seeding work?

- **Manual**: Use `setSeed()` for each participant
- **Random**: Use `shuffleSeeds()`
- **Bracket**: Standard seeding (1v8, 4v5, 3v6, 2v7)
- **Snake**: For groups (1-2-3-4, 8-7-6-5, ...)

### What's GSL format?

A 4-team double-elimination mini-bracket used in StarCraft II GSL:
1. Two opening matches
2. Winners match (winner advances 1st)
3. Losers match (loser eliminated)
4. Decider match (winner advances 2nd)

### How does Swiss pairing work?

Each round pairs participants with similar records (wins-losses). The system avoids rematches when possible and uses Buchholz (sum of opponents' wins) as tiebreaker.

### Can I run multiple tournaments simultaneously?

Yes! Each tournament is independent. Use `organizerId` to filter by organizer.

### How do I integrate with webhooks/notifications?

Listen to plugin events and send notifications:

```javascript
tournament.on('plg:tournament:match-completed', async ({ matchId, winnerId }) => {
  const match = await tournament.getMatch(matchId);
  await sendDiscordNotification(`${winnerId} won match ${matchId}!`);
});
```

---

## Resources

- [Internal Resources](#): `plg_tournaments`, `plg_tournament_matches`, `plg_tournament_registrations`
- [Seeding Strategies](../examples/tournament-seeding.js)
- [Bracket Visualization](../examples/tournament-bracket-viz.js)
