# Tournament Plugin

> **Manage esports and sports tournaments with multiple formats, automated brackets, and real-time match management.**

---

## TLDR

**Full-featured tournament engine with bracket generation, seeding, and standings.**

**1 line to get started:**
```javascript
await db.usePlugin(new TournamentPlugin());
```

**Key features:**
- 8 formats: Single/Double Elimination, Round Robin, Swiss, Groups, League, Ladder, Circuit
- Automated bracket generation and match advancement
- Registration, check-in, and seeding management
- Real-time standings and leaderboards
- Best-of series with game-level details

**Use cases:**
- Esports tournaments
- Sports leagues
- Competitive ladders
- Multi-stage championships

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { TournamentPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();
await db.usePlugin(new TournamentPlugin());

// Create tournament
const tournament = await db.plugins.tournament.create({
  name: 'Summer Championship 2024',
  organizerId: 'org-123',
  format: 'single-elimination',
  config: { bestOf: 3, thirdPlaceMatch: true }
});

// Register teams
await db.plugins.tournament.openRegistration(tournament.id);
await db.plugins.tournament.register(tournament.id, 'team-alpha');
await db.plugins.tournament.register(tournament.id, 'team-beta');

// Start and play
await db.plugins.tournament.startTournament(tournament.id);
const matches = await db.plugins.tournament.getMatches(tournament.id);

await db.plugins.tournament.reportResult(matches[0].id, {
  score1: 2,
  score2: 1,
  winnerId: 'team-alpha'
});
```

---

## Dependencies

**Zero external dependencies** - built directly into s3db.js core.

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, tournament formats, resource schemas, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Tournament lifecycle, registration, match management, real-world examples |
| [Best Practices](./guides/best-practices.md) | Performance, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Supported Formats

| Format | Code | Description |
|--------|------|-------------|
| Single Elimination | `single-elimination` | Standard bracket, loser is out |
| Double Elimination | `double-elimination` | Winners and losers brackets |
| Round Robin | `round-robin` | Everyone plays everyone |
| Swiss System | `swiss` | Non-elimination, similar records face each other |
| Group Stage | `group-stage` | Groups followed by playoffs |
| League | `league-playoffs` | Season with playoff bracket |
| Ladder | `ladder` | Dynamic ranking challenges |
| Circuit | `circuit` | Series of tournaments with points |

### Created Resources

| Resource | Description |
|----------|-------------|
| `plg_tournaments` | Tournament configuration and bracket data |
| `plg_tournament_matches` | Individual match records and scores |
| `plg_tournament_registrations` | Participant links and status |

### Core Methods

```javascript
// Tournament Management
await plugin.create({ name, format, config });
await plugin.get(tournamentId);
await plugin.update(tournamentId, { ... });
await plugin.delete(tournamentId);

// Lifecycle
await plugin.openRegistration(tournamentId);
await plugin.closeRegistration(tournamentId);
await plugin.startTournament(tournamentId);

// Registration
await plugin.register(tournamentId, participantId);
await plugin.checkIn(tournamentId, participantId);
await plugin.setSeed(tournamentId, participantId, seed);

// Matches
await plugin.getMatches(tournamentId, { status: 'pending' });
await plugin.reportResult(matchId, { score1, score2, winnerId });
await plugin.reportWalkover(matchId, winnerId, reason);

// Standings
await plugin.getStandings(tournamentId);
await plugin.getBracket(tournamentId);
```

---

## Configuration Examples

### Single Elimination

```javascript
const tournament = await plugin.create({
  name: 'Championship',
  format: 'single-elimination',
  config: {
    bestOf: 3,
    thirdPlaceMatch: true
  }
});
```

### Round Robin League

```javascript
const league = await plugin.create({
  name: 'Premier Division',
  format: 'round-robin',
  config: {
    rounds: 2,       // Double round robin
    pointsWin: 3,
    pointsDraw: 1
  }
});
```

### Swiss Tournament

```javascript
const swiss = await plugin.create({
  name: 'Major Qualifier',
  format: 'swiss',
  config: {
    rounds: 5,
    advanceWins: 3,
    eliminateLosses: 3
  }
});
```

### Group Stage + Playoffs

```javascript
const worldCup = await plugin.create({
  name: 'World Cup',
  format: 'group-stage',
  config: {
    groupSize: 4,
    advancePerGroup: 2,
    playoffFormat: 'single-elimination'
  }
});
```

---

## Tournament Lifecycle

```
draft → registration → in-progress → completed
                   ↘      ↓
                    → cancelled
```

| State | Description |
|-------|-------------|
| `draft` | Initial state, configuring tournament |
| `registration` | Accepting participant sign-ups |
| `in-progress` | Tournament running, reporting results |
| `completed` | All matches finished |
| `cancelled` | Tournament cancelled |

---

## See Also

- [Scheduler Plugin](../scheduler/README.md) - Schedule tournament events
- [Cache Plugin](../cache/README.md) - Cache standings and brackets

