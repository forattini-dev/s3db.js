# 🏆 Tournament Plugin

> **Manage esports and sports tournaments with multiple formats, automated brackets, and real-time match management.**
>
> **Navigation:** [Installation](#-installation) | [Quick Start](#-quick-start) | [Supported Formats](#-supported-formats) | [API Reference](#-api-reference)

---

The **TournamentPlugin** transforms s3db.js into a full-featured tournament engine. It handles the complexity of bracket generation, seeding, match scheduling, and standing calculations, allowing you to focus on the user experience.

## ✨ Key Features

- **Multiple Formats**: Single/Double Elimination, Round Robin, Swiss, Group Stages, and more.
- **Automated Brackets**: Generates and updates brackets automatically as matches complete.
- **Match Management**: Schedule matches, report scores, and handle walkovers.
- **Participant Management**: Registration flows, check-ins, and seeding.
- **Real-time Standings**: Auto-calculated leaderboards and rankings.
- **Scalable**: Built on s3db.js partitions to handle thousands of matches.

---

## 💾 Installation

```bash
npm install s3db.js
```

*No additional peer dependencies required.*

---

## 🚀 Quick Start

### 1. Initialize the Plugin

```javascript
import { S3db, TournamentPlugin } from 's3db.js';

const db = new S3db({ connectionString: 's3://bucket/db' });

// Register the plugin
await db.usePlugin(new TournamentPlugin({
  resourceNames: {
    tournaments: 'tournaments',
    matches: 'matches',
    registrations: 'registrations'
  }
}));

await db.connect();
```

### 2. Create a Tournament

```javascript
const tournament = await db.plugins.tournament.create({
  name: 'Summer Championship 2024',
  organizerId: 'org-123',
  format: 'single-elimination', // or 'round-robin', 'swiss', etc.
  participantType: 'team',      // or 'user'
  config: {
    bestOf: 3,                  // Bo3 matches
    thirdPlaceMatch: true       // Include 3rd place decider
  }
});
```

### 3. Handle Registrations

```javascript
const tournamentId = tournament.id;

// Open registration
await db.plugins.tournament.openRegistration(tournamentId);

// Register participants
await db.plugins.tournament.register(tournamentId, 'team-alpha');
await db.plugins.tournament.register(tournamentId, 'team-beta');
await db.plugins.tournament.register(tournamentId, 'team-gamma');
await db.plugins.tournament.register(tournamentId, 'team-delta');

// Confirm them (if using a review process)
await db.plugins.tournament.confirmRegistration(tournamentId, 'team-alpha');
// ... confirm others ...
```

### 4. Start & Manage Matches

```javascript
// Start the tournament (generates bracket and initial matches)
await db.plugins.tournament.startTournament(tournamentId);

// List upcoming matches
const matches = await db.plugins.tournament.getMatches(tournamentId, { status: 'pending' });
const firstMatch = matches[0];

console.log(`Match ${firstMatch.matchNumber}: ${firstMatch.participant1Id} vs ${firstMatch.participant2Id}`);

// Report result (advances winner automatically)
await db.plugins.tournament.reportResult(firstMatch.id, {
  score1: 2,
  score2: 1,
  winnerId: firstMatch.participant1Id
});
```

---

## 📋 Supported Formats

The plugin includes a modular format system.

| Format | Code | Description | Config Options |
|--------|------|-------------|----------------|
| **Single Elimination** | `single-elimination` | Standard bracket. Loser is out. | `bestOf`, `thirdPlaceMatch` |
| **Double Elimination** | `double-elimination` | Winners and Losers brackets. | `bestOf`, `grandFinalReset` |
| **Round Robin** | `round-robin` | Everyone plays everyone. | `rounds` (1=single, 2=double), `pointsWin`, `pointsDraw` |
| **Swiss System** | `swiss` | Non-elimination format for many players. | `rounds`, `advanceWins`, `eliminateLosses` |
| **Group Stage** | `group-stage` | Groups followed by playoffs. | `groupSize`, `advancePerGroup` |
| **League** | `league-playoffs` | Long-running league season. | `seasonLength`, `promotionCount` |
| **Ladder** | `ladder` | Dynamic ranking challenges. | `challengeRange`, `inactivityDays` |
| **Circuit** | `circuit` | Series of tournaments with points. | `pointSystem` |

---

## 📚 API Reference

The plugin exposes managers for different aspects of the tournament lifecycle.

### Tournament Management

```javascript
// Create
const t = await plugin.create({ ...options });

// Get
const t = await plugin.get(tournamentId);

// Update settings
await plugin.update(tournamentId, { name: 'New Name' });

// Delete (cascades to matches and registrations)
await plugin.delete(tournamentId);

// List with filters
const list = await plugin.list({ status: 'in-progress', organizerId: 'org-1' });
```

### Lifecycle Control

```javascript
// Registration Phase
await plugin.openRegistration(id);
await plugin.closeRegistration(id);

// Execution Phase
await plugin.startTournament(id); // Generates bracket
await plugin.cancel(id, 'Rain delay');
await plugin.complete(id); // Called automatically when final match ends
```

### Registration & Seeding

```javascript
// Register
await plugin.register(id, participantId, { metadata: { ... } });

// Lifecycle
await plugin.checkIn(id, participantId);
await plugin.withdraw(id, participantId);

// Seeding
await plugin.setSeed(id, participantId, 1); // Set #1 seed
await plugin.shuffleSeeds(id); // Randomize remaining seeds
```

### Match Operations

```javascript
// Get specific match
const match = await plugin.getMatch(matchId);

// Schedule
await plugin.scheduleMatch(matchId, startTimeTimestamp);

// Report Result
await plugin.reportResult(matchId, {
  score1: 2,
  score2: 0,
  games: [ ... ], // Optional game details
  metadata: { demoUrl: '...' }
});

// Walkover (W.O.)
await plugin.reportWalkover(matchId, winnerId, 'Opponent did not show');
```

### Standings & Data

```javascript
// Get current standings/leaderboard
const standings = await plugin.getStandings(tournamentId);
// [
//   { participantId: 'team-1', rank: 1, points: 9, ... },
//   { participantId: 'team-2', rank: 2, points: 6, ... }
// ]

// Get full bracket structure (for visualization)
const bracket = await plugin.getBracket(tournamentId);
```

---

## 🏗️ Data Structure

The plugin creates three specialized resources in your database:

1. **Tournaments** (`plg_tournaments`): Configuration, status, and bracket data.
2. **Matches** (`plg_tournament_matches`): Individual match records, scores, and scheduling.
3. **Registrations** (`plg_tournament_registrations`): Participant links and status.

*Note: Resource names can be customized during plugin initialization.*