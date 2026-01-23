# Usage Patterns

> **In this guide:** Tournament lifecycle, registration flows, match management, and real-world examples.

**Navigation:** [← Back to Tournament Plugin](../README.md) | [Configuration](./configuration.md)

---

## Tournament Lifecycle

### State Machine

```
draft → registration → in-progress → completed
                   ↘      ↓
                    → cancelled
```

| State | Description | Allowed Actions |
|-------|-------------|-----------------|
| `draft` | Initial state, configuring | Update settings, open registration |
| `registration` | Accepting participants | Register, confirm, check-in, close registration |
| `in-progress` | Tournament running | Report results, schedule matches |
| `completed` | Tournament finished | View standings, export data |
| `cancelled` | Tournament cancelled | View history |

---

## Basic Tournament Flow

### 1. Create Tournament

```javascript
import { Database } from 's3db.js';
import { TournamentPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

await db.usePlugin(new TournamentPlugin());

const tournament = await db.plugins.tournament.create({
  name: 'Summer Championship 2024',
  organizerId: 'org-123',
  format: 'single-elimination',
  participantType: 'team',
  config: {
    bestOf: 3,
    thirdPlaceMatch: true
  }
});
```

### 2. Registration Phase

```javascript
// Open registration
await db.plugins.tournament.openRegistration(tournament.id);

// Register teams
for (const teamId of teamIds) {
  await db.plugins.tournament.register(tournament.id, teamId, {
    metadata: { contactEmail: 'team@example.com' }
  });
}

// Confirm registrations (optional review step)
for (const teamId of confirmedTeams) {
  await db.plugins.tournament.confirmRegistration(tournament.id, teamId);
}

// Set seeds (optional)
await db.plugins.tournament.setSeed(tournament.id, 'team-1', 1); // #1 seed
await db.plugins.tournament.setSeed(tournament.id, 'team-2', 2); // #2 seed
await db.plugins.tournament.shuffleSeeds(tournament.id); // Randomize rest

// Close registration
await db.plugins.tournament.closeRegistration(tournament.id);
```

### 3. Check-In Phase

```javascript
// Players check in before tournament starts
await db.plugins.tournament.checkIn(tournament.id, 'team-1');
await db.plugins.tournament.checkIn(tournament.id, 'team-2');

// Get checked-in participants
const checkedIn = await db.plugins.tournament.getRegistrations(tournament.id, {
  status: 'checked-in'
});

console.log(`${checkedIn.length} teams ready`);
```

### 4. Start Tournament

```javascript
// Generates bracket and initial matches
await db.plugins.tournament.startTournament(tournament.id);

// Get first round matches
const matches = await db.plugins.tournament.getMatches(tournament.id, {
  round: 1
});

for (const match of matches) {
  console.log(`Match ${match.matchNumber}: ${match.participant1Id} vs ${match.participant2Id}`);
}
```

### 5. Report Results

```javascript
// Get pending matches
const pendingMatches = await db.plugins.tournament.getMatches(tournament.id, {
  status: 'pending'
});

// Report a result (automatically advances winner)
await db.plugins.tournament.reportResult(pendingMatches[0].id, {
  score1: 2,
  score2: 1,
  winnerId: pendingMatches[0].participant1Id
});

// Report walkover if team doesn't show
await db.plugins.tournament.reportWalkover(pendingMatches[1].id,
  pendingMatches[1].participant2Id,
  'Team Alpha no-show'
);
```

### 6. Complete Tournament

```javascript
// Tournament auto-completes when final match is reported
// Or manually complete:
await db.plugins.tournament.complete(tournament.id);

// Get final standings
const standings = await db.plugins.tournament.getStandings(tournament.id);
console.log('Winner:', standings[0].participantId);
```

---

## Advanced Patterns

### Best-of Series with Game Details

```javascript
await db.plugins.tournament.reportResult(matchId, {
  score1: 2,
  score2: 1,
  winnerId: 'team-1',
  games: [
    { score1: 16, score2: 14, map: 'Dust2' },
    { score1: 12, score2: 16, map: 'Mirage' },
    { score1: 16, score2: 8, map: 'Inferno' }
  ],
  metadata: {
    mvp: 'player-123',
    demoUrl: 'https://demos.example.com/match123'
  }
});
```

### Scheduling Matches

```javascript
// Schedule match for specific time
const matchTime = new Date('2024-07-15T18:00:00Z').getTime();
await db.plugins.tournament.scheduleMatch(matchId, matchTime);

// Get today's scheduled matches
const today = new Date();
const todayStart = new Date(today.setHours(0, 0, 0, 0)).getTime();
const todayEnd = new Date(today.setHours(23, 59, 59, 999)).getTime();

const todayMatches = await db.plugins.tournament.getMatches(tournament.id, {
  status: 'scheduled',
  scheduledAfter: todayStart,
  scheduledBefore: todayEnd
});
```

### Bracket Visualization Data

```javascript
const bracket = await db.plugins.tournament.getBracket(tournament.id);

// Structure for rendering bracket UI
// {
//   rounds: [
//     { name: 'Round 1', matches: [...] },
//     { name: 'Semifinals', matches: [...] },
//     { name: 'Final', matches: [...] }
//   ],
//   matches: [
//     { id, round, matchNumber, participant1Id, participant2Id, winnerId, ... }
//   ]
// }
```

---

## Real-World Examples

### Esports Tournament

```javascript
const csgoTournament = await db.plugins.tournament.create({
  name: 'CS2 Major Qualifier',
  organizerId: 'org-esports',
  format: 'swiss',
  participantType: 'team',
  config: {
    rounds: 5,
    advanceWins: 3,      // 3 wins = qualify
    eliminateLosses: 3   // 3 losses = eliminated
  }
});

// After Swiss rounds, top teams advance to playoffs
const qualifiedTeams = await db.plugins.tournament.getStandings(csgoTournament.id);
const top8 = qualifiedTeams.filter(t => t.wins >= 3);

// Create playoff bracket
const playoffs = await db.plugins.tournament.create({
  name: 'CS2 Major Playoffs',
  format: 'single-elimination',
  config: { bestOf: 3, thirdPlaceMatch: false }
});

// Register qualified teams
for (const team of top8) {
  await db.plugins.tournament.register(playoffs.id, team.participantId);
}
```

### Sports League

```javascript
const league = await db.plugins.tournament.create({
  name: 'Premier Division 2024',
  organizerId: 'org-league',
  format: 'league-playoffs',
  participantType: 'team',
  config: {
    seasonLength: 22,      // 22 matchdays
    playoffTeams: 6,       // Top 6 make playoffs
    relegationCount: 2     // Bottom 2 relegated
  }
});

// Season runs over months
// Get current standings
const standings = await db.plugins.tournament.getStandings(league.id);

// After season, top 6 enter playoffs
// Standings include: points, wins, draws, losses, goalsFor, goalsAgainst, goalDiff
```

### Ranked Ladder

```javascript
const ladder = await db.plugins.tournament.create({
  name: 'Competitive Ladder',
  organizerId: 'org-ranked',
  format: 'ladder',
  participantType: 'user',
  config: {
    challengeRange: 5,     // Can challenge up to 5 ranks above
    inactivityDays: 7      // Lose rank after 7 days inactive
  }
});

// New player joins at bottom
await db.plugins.tournament.register(ladder.id, 'player-new');

// Player challenges someone above
await db.plugins.tournament.createChallenge(ladder.id, 'player-new', 'player-rank-50');

// If challenger wins, they swap positions
await db.plugins.tournament.reportResult(challengeMatchId, {
  winnerId: 'player-new'
});
// player-new is now rank 50, previous player-rank-50 is now at new player's old rank
```

### Multi-Stage Tournament (Groups + Playoffs)

```javascript
// Stage 1: Group Stage
const groups = await db.plugins.tournament.create({
  name: 'World Cup Groups',
  format: 'group-stage',
  config: {
    groupSize: 4,
    advancePerGroup: 2
  }
});

// Register 32 teams into 8 groups
for (const team of teams) {
  await db.plugins.tournament.register(groups.id, team.id);
}

// Start groups
await db.plugins.tournament.startTournament(groups.id);

// ... play all group matches ...

// Get advancing teams
const standings = await db.plugins.tournament.getStandings(groups.id);
const advancingTeams = standings.filter(t => t.groupRank <= 2);

// Stage 2: Knockout
const knockouts = await db.plugins.tournament.create({
  name: 'World Cup Knockouts',
  format: 'single-elimination',
  config: { bestOf: 1, thirdPlaceMatch: true }
});

for (const team of advancingTeams) {
  await db.plugins.tournament.register(knockouts.id, team.participantId, {
    metadata: { seedFromGroup: team.groupRank }
  });
}

await db.plugins.tournament.startTournament(knockouts.id);
```

### Circuit Series

```javascript
const circuit = await db.plugins.tournament.create({
  name: 'Pro Tour 2024',
  format: 'circuit',
  config: {
    events: 4,
    pointSystem: {
      1: 100,
      2: 70,
      3: 50,
      4: 30,
      5: 20,
      6: 10
    }
  }
});

// Each event is a separate tournament
const event1 = await db.plugins.tournament.create({
  name: 'Pro Tour Stop 1 - New York',
  format: 'single-elimination',
  parentCircuitId: circuit.id
});

// Points accumulate across events
const circuitStandings = await db.plugins.tournament.getCircuitStandings(circuit.id);
// [{ participantId, totalPoints, events: [{ eventId, placement, points }] }]
```

---

## Monitoring & Webhooks

### Track Tournament Progress

```javascript
// Get tournament status
const tournament = await db.plugins.tournament.get(tournamentId);
console.log(`Status: ${tournament.status}`);
console.log(`Completed matches: ${tournament.completedMatches}/${tournament.totalMatches}`);

// Get match statistics
const matches = await db.plugins.tournament.getMatches(tournamentId);
const pending = matches.filter(m => m.status === 'pending').length;
const inProgress = matches.filter(m => m.status === 'in-progress').length;
const completed = matches.filter(m => m.status === 'completed').length;
```

### Export Tournament Data

```javascript
// Export full tournament data
const exportData = {
  tournament: await db.plugins.tournament.get(tournamentId),
  matches: await db.plugins.tournament.getMatches(tournamentId),
  standings: await db.plugins.tournament.getStandings(tournamentId),
  registrations: await db.plugins.tournament.getRegistrations(tournamentId)
};

// Save to file or send to external system
await fs.writeFile('tournament-export.json', JSON.stringify(exportData, null, 2));
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ

