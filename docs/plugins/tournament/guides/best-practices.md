# Best Practices & FAQ

> **In this guide:** Performance optimization, error handling, troubleshooting, and comprehensive FAQ.

**Navigation:** [← Back to Tournament Plugin](../README.md) | [Configuration](./configuration.md)

---

## Best Practices

### 1. Choose the Right Format

```javascript
// Small tournaments (8-16 participants): Single Elimination
{ format: 'single-elimination' }

// Fair but longer tournaments: Double Elimination
{ format: 'double-elimination' }

// Large player pools with limited time: Swiss
{ format: 'swiss', config: { rounds: 5 } }

// League play over extended period: Round Robin
{ format: 'round-robin' }

// Mixed: Group stage + Playoffs
{ format: 'group-stage', config: { advancePerGroup: 2 } }
```

### 2. Validate Participant Count

```javascript
// Single/Double Elimination work best with power-of-2
const participantCount = registrations.length;

if (format === 'single-elimination') {
  const idealCounts = [4, 8, 16, 32, 64, 128];
  if (!idealCounts.includes(participantCount)) {
    console.warn(`${participantCount} participants will result in byes`);
  }
}
```

### 3. Use Seeding Properly

```javascript
// Seed top players to prevent early elimination
await plugin.setSeed(tournamentId, 'champion', 1);    // #1 seed
await plugin.setSeed(tournamentId, 'runner-up', 2);   // #2 seed

// Proper seeding ensures #1 and #2 can only meet in finals
// Without seeding, they might face each other in round 1!
```

### 4. Handle Check-Ins

```javascript
// Require check-in before tournament starts
const notCheckedIn = registrations.filter(r => r.status !== 'checked-in');

if (notCheckedIn.length > 0) {
  // Disqualify no-shows
  for (const reg of notCheckedIn) {
    await plugin.withdraw(tournamentId, reg.participantId);
  }
}

// Then start tournament
await plugin.startTournament(tournamentId);
```

### 5. Schedule Matches in Advance

```javascript
// Schedule all round 1 matches
const round1Matches = await plugin.getMatches(tournamentId, { round: 1 });

let matchTime = new Date('2024-07-15T14:00:00Z').getTime();
const matchDuration = 60 * 60 * 1000; // 1 hour between matches

for (const match of round1Matches) {
  await plugin.scheduleMatch(match.id, matchTime);
  matchTime += matchDuration;
}
```

### 6. Use Metadata for Custom Data

```javascript
// Store custom data without modifying schema
await plugin.reportResult(matchId, {
  score1: 2,
  score2: 1,
  winnerId: 'team-1',
  metadata: {
    mvp: 'player-123',
    highlights: ['https://youtube.com/watch?v=...'],
    referee: 'admin-456',
    notes: 'Match was delayed 15 minutes'
  }
});
```

---

## Error Handling

### Common Errors

```javascript
import {
  TournamentNotFoundError,
  InvalidStateError,
  RegistrationClosedError,
  MatchNotFoundError
} from 's3db.js';

try {
  await plugin.register(tournamentId, participantId);
} catch (error) {
  if (error instanceof TournamentNotFoundError) {
    console.error('Tournament does not exist');
  } else if (error instanceof RegistrationClosedError) {
    console.error('Registration is closed');
  } else if (error instanceof InvalidStateError) {
    console.error(`Cannot register in ${error.currentState} state`);
  }
}
```

### Safe Result Reporting

```javascript
async function reportMatchResult(matchId, result) {
  try {
    await plugin.reportResult(matchId, result);
    return { success: true };
  } catch (error) {
    if (error instanceof MatchNotFoundError) {
      return { success: false, error: 'Match not found' };
    }
    if (error instanceof InvalidStateError) {
      return { success: false, error: 'Match already completed' };
    }
    throw error; // Re-throw unexpected errors
  }
}
```

---

## Troubleshooting

### Bracket Has Byes

**Cause:** Participant count is not a power of 2

**Solution:** This is expected behavior. Byes advance automatically.

```javascript
// 6 participants in single elimination:
// Round 1: 4 matches (2 byes advance automatically)
// Round 2: 4 participants
// Final: 2 participants
```

### Match Shows Wrong Participants

**Cause:** Seeding not set before starting tournament

**Solution:** Always set seeds before `startTournament()`:

```javascript
// Correct order:
await plugin.closeRegistration(tournamentId);
await plugin.setSeed(tournamentId, 'top-seed', 1);
await plugin.startTournament(tournamentId);
```

### Tournament Stuck in Registration

**Cause:** Registration not closed or minimum participants not met

**Solution:**

```javascript
const registrations = await plugin.getRegistrations(tournamentId);
console.log(`Registered: ${registrations.length}`);

// Close registration first
await plugin.closeRegistration(tournamentId);

// Then start
await plugin.startTournament(tournamentId);
```

### Results Not Advancing Winner

**Cause:** Missing `winnerId` in result

**Solution:** Always include `winnerId`:

```javascript
// Wrong - winner not specified
await plugin.reportResult(matchId, { score1: 2, score2: 1 });

// Correct - winner explicitly set
await plugin.reportResult(matchId, {
  score1: 2,
  score2: 1,
  winnerId: 'team-1'  // Required for bracket advancement
});
```

### Double Elimination Grand Final Issues

**Cause:** Grand final reset logic confusion

**Solution:** In double elimination, if the player from losers bracket wins the first grand final, a reset match is needed (if `grandFinalReset: true`):

```javascript
const config = { grandFinalReset: true };

// Grand Final 1: Winners bracket champion vs Losers bracket champion
// If losers champ wins → Grand Final 2 (reset)
// If winners champ wins → Tournament over
```

---

## FAQ

### General

**Q: What tournament formats are supported?**

A: Single Elimination, Double Elimination, Round Robin, Swiss, Group Stage, League with Playoffs, Ladder, and Circuit.

**Q: Can I mix formats?**

A: Yes! Use Group Stage format which combines round-robin groups with elimination playoffs, or create multiple linked tournaments manually.

**Q: What's the maximum participants supported?**

A: No hard limit. The plugin uses s3db.js partitions, so it scales to thousands of matches. Practical limits depend on your use case.

### Bracket Generation

**Q: How are brackets seeded?**

A: Higher seeds are placed to meet lower seeds in early rounds. Seeds 1 and 2 are placed to meet only in the final (if both win all matches).

**Q: What happens with non-power-of-2 participants?**

A: Byes are automatically assigned. Lower seeds get byes first.

**Q: Can I manually set bracket positions?**

A: Set seeds before starting. The bracket generator respects seed order.

### Match Management

**Q: Can I edit a reported result?**

A: Yes, but with caution. Use `updateResult()` which recalculates subsequent matches.

**Q: How do walkovers work?**

A: Call `reportWalkover(matchId, winnerId, reason)`. The winner advances, loser is marked as walkover loss.

**Q: Can matches have ties?**

A: In Round Robin/League formats, yes. In elimination formats, no - a winner must be declared.

### State Management

**Q: Can I revert tournament state?**

A: State transitions are one-way for data integrity. If needed, cancel the tournament and create a new one.

**Q: What happens if I delete a tournament?**

A: All matches and registrations are cascade-deleted.

**Q: Can I pause a tournament?**

A: There's no explicit pause state. Just stop reporting results. The tournament remains in `in-progress` state.

### Integration

**Q: Can I integrate with external bracket services?**

A: Yes, export bracket data with `getBracket()` and standings with `getStandings()`.

**Q: How do I show live updates?**

A: Poll `getMatches()` and `getStandings()` periodically, or use s3db.js webhooks/events for real-time updates.

**Q: Can I import from other tournament platforms?**

A: No built-in import, but you can programmatically create tournaments and register results via the API.

### Performance

**Q: How many matches can a tournament have?**

A: No limit. Single elimination with 128 players = 127 matches. Round robin with 20 teams = 380 matches.

**Q: Is match data partitioned?**

A: Yes, matches are partitioned by `tournamentId` for efficient queries.

**Q: How do I optimize large tournaments?**

A: Use pagination when querying matches:
```javascript
const matches = await plugin.getMatches(tournamentId, {
  limit: 50,
  offset: 0
});
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Tournament lifecycle, real-world examples

