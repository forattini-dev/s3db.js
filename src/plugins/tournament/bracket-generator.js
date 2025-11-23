/**
 * Bracket Generator
 * Utilities for generating tournament bracket structures
 */
import { nextPowerOf2, calculateByes, bracketSeeding } from './seeding-strategies.js';

/**
 * Generate single elimination bracket
 * @param {Array<string>} participants - Seeded participants
 * @param {Object} config - Bracket configuration
 * @returns {Object} Bracket structure
 */
export function generateSingleEliminationBracket(participants, config = {}) {
  const { bestOf = 1 } = config;
  const bracketSize = nextPowerOf2(participants.length);
  const numRounds = Math.log2(bracketSize);
  const byeCount = calculateByes(participants.length);

  // Apply bracket seeding
  const seededSlots = bracketSeeding(participants, bracketSize);

  const bracket = {
    type: 'single-elimination',
    size: bracketSize,
    rounds: numRounds,
    slots: seededSlots,
    matches: [],
    byeCount
  };

  // Generate first round matches
  let matchNumber = 1;
  const firstRoundMatches = [];

  for (let i = 0; i < bracketSize; i += 2) {
    const p1 = seededSlots[i];
    const p2 = seededSlots[i + 1];

    const match = {
      id: `R1M${matchNumber}`,
      round: 1,
      matchNumber,
      participant1Id: p1,
      participant2Id: p2,
      bestOf,
      status: (p1 && p2) ? 'pending' : (p1 || p2 ? 'bye' : 'empty'),
      winnerId: null,
      nextMatchId: `R2M${Math.ceil(matchNumber / 2)}`
    };

    // Handle byes - auto-advance
    if (p1 && !p2) {
      match.winnerId = p1;
      match.status = 'completed';
    } else if (p2 && !p1) {
      match.winnerId = p2;
      match.status = 'completed';
    }

    firstRoundMatches.push(match);
    matchNumber++;
  }

  bracket.matches.push(firstRoundMatches);

  // Generate subsequent rounds
  for (let round = 2; round <= numRounds; round++) {
    const roundMatches = [];
    const prevRoundCount = bracket.matches[round - 2].length;
    const thisRoundCount = prevRoundCount / 2;

    for (let i = 1; i <= thisRoundCount; i++) {
      const match = {
        id: `R${round}M${i}`,
        round,
        matchNumber: i,
        participant1Id: null,
        participant2Id: null,
        bestOf: round === numRounds ? (config.finalsBestOf || bestOf) : bestOf,
        status: 'pending',
        winnerId: null,
        nextMatchId: round < numRounds ? `R${round + 1}M${Math.ceil(i / 2)}` : null
      };
      roundMatches.push(match);
    }

    bracket.matches.push(roundMatches);
  }

  // Propagate byes to next rounds
  propagateByes(bracket);

  return bracket;
}

/**
 * Generate double elimination bracket
 * @param {Array<string>} participants - Seeded participants
 * @param {Object} config - Bracket configuration
 * @returns {Object} Bracket structure
 */
export function generateDoubleEliminationBracket(participants, config = {}) {
  const { bestOf = 1, grandFinalsBestOf = bestOf, grandFinalsReset = true } = config;
  const bracketSize = nextPowerOf2(participants.length);
  const winnersRounds = Math.log2(bracketSize);
  const losersRounds = (winnersRounds - 1) * 2;

  const seededSlots = bracketSeeding(participants, bracketSize);

  const bracket = {
    type: 'double-elimination',
    size: bracketSize,
    winnersRounds,
    losersRounds,
    slots: seededSlots,
    winnersMatches: [],
    losersMatches: [],
    grandFinals: null,
    grandFinalsReset
  };

  // Generate Winners Bracket (same as single elimination)
  let wMatchNum = 1;
  for (let round = 1; round <= winnersRounds; round++) {
    const roundMatches = [];
    const matchCount = bracketSize / Math.pow(2, round);

    for (let i = 1; i <= matchCount; i++) {
      const match = {
        id: `WR${round}M${i}`,
        phase: 'winners',
        round,
        matchNumber: i,
        participant1Id: round === 1 ? seededSlots[(i - 1) * 2] : null,
        participant2Id: round === 1 ? seededSlots[(i - 1) * 2 + 1] : null,
        bestOf,
        status: 'pending',
        winnerId: null,
        loserId: null,
        nextMatchId: round < winnersRounds ? `WR${round + 1}M${Math.ceil(i / 2)}` : 'GF',
        loserNextMatchId: null // Will be calculated
      };

      // Handle first round byes
      if (round === 1) {
        if (match.participant1Id && !match.participant2Id) {
          match.winnerId = match.participant1Id;
          match.loserId = null;
          match.status = 'completed';
        } else if (match.participant2Id && !match.participant1Id) {
          match.winnerId = match.participant2Id;
          match.loserId = null;
          match.status = 'completed';
        }
      }

      roundMatches.push(match);
      wMatchNum++;
    }
    bracket.winnersMatches.push(roundMatches);
  }

  // Generate Losers Bracket
  for (let round = 1; round <= losersRounds; round++) {
    const roundMatches = [];
    // Losers bracket size reduces every 2 rounds
    const matchCount = bracketSize / Math.pow(2, Math.floor((round + 1) / 2) + 1);

    for (let i = 1; i <= matchCount; i++) {
      const match = {
        id: `LR${round}M${i}`,
        phase: 'losers',
        round,
        matchNumber: i,
        participant1Id: null,
        participant2Id: null,
        bestOf,
        status: 'pending',
        winnerId: null,
        loserId: null,
        nextMatchId: round < losersRounds ? `LR${round + 1}M${Math.ceil(i / (round % 2 === 0 ? 2 : 1))}` : 'GF'
      };
      roundMatches.push(match);
    }
    bracket.losersMatches.push(roundMatches);
  }

  // Calculate loser drop-down mappings
  calculateLoserMappings(bracket);

  // Grand Finals
  bracket.grandFinals = {
    id: 'GF',
    phase: 'grand-finals',
    round: 1,
    matchNumber: 1,
    participant1Id: null, // Winners bracket winner
    participant2Id: null, // Losers bracket winner
    bestOf: grandFinalsBestOf,
    status: 'pending',
    winnerId: null,
    requiresReset: grandFinalsReset
  };

  // Propagate byes
  propagateDoubleElimByes(bracket);

  return bracket;
}

/**
 * Generate round robin schedule
 * @param {Array<string>} participants - Participants
 * @param {Object} config - Configuration
 * @returns {Object} Schedule structure
 */
export function generateRoundRobinSchedule(participants, config = {}) {
  const { rounds = 1, bestOf = 1 } = config;
  const n = participants.length;
  const isOdd = n % 2 === 1;
  const teams = isOdd ? [...participants, null] : [...participants]; // Add bye if odd
  const teamCount = teams.length;
  const roundCount = teamCount - 1;

  const schedule = {
    type: 'round-robin',
    participants: [...participants],
    rounds: rounds,
    totalRounds: roundCount * rounds,
    matchesPerRound: teamCount / 2,
    matches: []
  };

  // Generate using circle method
  for (let turn = 0; turn < rounds; turn++) {
    for (let round = 0; round < roundCount; round++) {
      const roundMatches = [];
      const actualRound = turn * roundCount + round + 1;

      for (let match = 0; match < teamCount / 2; match++) {
        const home = (round + match) % (teamCount - 1);
        let away = (teamCount - 1 - match + round) % (teamCount - 1);

        // Last team stays fixed
        if (match === 0) {
          away = teamCount - 1;
        }

        const p1 = teams[home];
        const p2 = teams[away];

        // Skip bye matches
        if (!p1 || !p2) continue;

        // Alternate home/away in second turn
        const [participant1Id, participant2Id] = turn % 2 === 0
          ? [p1, p2]
          : [p2, p1];

        roundMatches.push({
          id: `R${actualRound}M${match + 1}`,
          round: actualRound,
          matchNumber: match + 1,
          participant1Id,
          participant2Id,
          bestOf,
          status: 'pending',
          winnerId: null
        });
      }

      schedule.matches.push(roundMatches);
    }
  }

  return schedule;
}

/**
 * Generate Swiss pairing for a round
 * @param {Array<Object>} standings - Current standings
 * @param {Array<Object>} previousMatches - Previous matches
 * @param {Object} config - Configuration
 * @returns {Array<Object>} Pairings for this round
 */
export function generateSwissPairing(standings, previousMatches, config = {}) {
  const { bestOf = 1, avoidRematches = true } = config;

  // Build opponent history
  const opponentHistory = new Map();
  for (const match of previousMatches) {
    if (!opponentHistory.has(match.participant1Id)) {
      opponentHistory.set(match.participant1Id, new Set());
    }
    if (!opponentHistory.has(match.participant2Id)) {
      opponentHistory.set(match.participant2Id, new Set());
    }
    opponentHistory.get(match.participant1Id).add(match.participant2Id);
    opponentHistory.get(match.participant2Id).add(match.participant1Id);
  }

  // Sort by wins then by tiebreakers
  const sorted = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return 0;
  });

  const paired = new Set();
  const pairings = [];
  let matchNum = 1;

  for (let i = 0; i < sorted.length; i++) {
    const p1 = sorted[i];
    if (paired.has(p1.participantId)) continue;

    // Find best opponent (similar record, not played before if possible)
    let bestOpponent = null;
    let bestScore = -Infinity;

    for (let j = i + 1; j < sorted.length; j++) {
      const p2 = sorted[j];
      if (paired.has(p2.participantId)) continue;

      const prevOpponents = opponentHistory.get(p1.participantId) || new Set();
      const hasPlayed = prevOpponents.has(p2.participantId);

      if (avoidRematches && hasPlayed) continue;

      // Score based on record similarity
      const winDiff = Math.abs(p1.wins - p2.wins);
      const score = -winDiff + (hasPlayed ? -100 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestOpponent = p2;
      }
    }

    if (bestOpponent) {
      paired.add(p1.participantId);
      paired.add(bestOpponent.participantId);

      pairings.push({
        matchNumber: matchNum++,
        participant1Id: p1.participantId,
        participant2Id: bestOpponent.participantId,
        bestOf,
        status: 'pending'
      });
    }
  }

  // Handle bye if odd number of participants
  const unpaired = sorted.filter(p => !paired.has(p.participantId));
  if (unpaired.length === 1) {
    pairings.push({
      matchNumber: matchNum,
      participant1Id: unpaired[0].participantId,
      participant2Id: null,
      bestOf: 1,
      status: 'bye',
      winnerId: unpaired[0].participantId
    });
  }

  return pairings;
}

/**
 * Generate GSL-style group bracket
 * @param {Array<string>} participants - 4 participants for the group
 * @param {Object} config - Configuration
 * @returns {Object} GSL bracket
 */
export function generateGSLBracket(participants, config = {}) {
  const { bestOf = 1 } = config;

  if (participants.length !== 4) {
    throw new Error('GSL bracket requires exactly 4 participants');
  }

  return {
    type: 'gsl',
    participants: [...participants],
    matches: [
      // Opening matches
      {
        id: 'OM1',
        type: 'opening',
        round: 1,
        participant1Id: participants[0],
        participant2Id: participants[1],
        bestOf,
        status: 'pending',
        winnerId: null,
        loserId: null,
        winnerNextMatch: 'WM',
        loserNextMatch: 'LM'
      },
      {
        id: 'OM2',
        type: 'opening',
        round: 1,
        participant1Id: participants[2],
        participant2Id: participants[3],
        bestOf,
        status: 'pending',
        winnerId: null,
        loserId: null,
        winnerNextMatch: 'WM',
        loserNextMatch: 'LM'
      },
      // Winners match (determines 1st seed)
      {
        id: 'WM',
        type: 'winners',
        round: 2,
        participant1Id: null, // OM1 winner
        participant2Id: null, // OM2 winner
        bestOf,
        status: 'pending',
        winnerId: null,
        loserId: null,
        loserNextMatch: 'DM'
      },
      // Losers match (elimination)
      {
        id: 'LM',
        type: 'losers',
        round: 2,
        participant1Id: null, // OM1 loser
        participant2Id: null, // OM2 loser
        bestOf,
        status: 'pending',
        winnerId: null, // Goes to decider
        loserId: null,  // Eliminated
        winnerNextMatch: 'DM'
      },
      // Decider match (determines 2nd seed)
      {
        id: 'DM',
        type: 'decider',
        round: 3,
        participant1Id: null, // WM loser
        participant2Id: null, // LM winner
        bestOf,
        status: 'pending',
        winnerId: null, // 2nd seed
        loserId: null   // Eliminated
      }
    ],
    advancing: [],  // [1st, 2nd]
    eliminated: []
  };
}

/**
 * Propagate bye winners to next round
 */
function propagateByes(bracket) {
  for (let round = 0; round < bracket.matches.length - 1; round++) {
    for (const match of bracket.matches[round]) {
      if (match.status === 'completed' && match.winnerId && match.nextMatchId) {
        const nextRound = bracket.matches[round + 1];
        const nextMatch = nextRound.find(m => m.id === match.nextMatchId);

        if (nextMatch) {
          const slot = match.matchNumber % 2 === 1 ? 'participant1Id' : 'participant2Id';
          nextMatch[slot] = match.winnerId;
        }
      }
    }
  }
}

/**
 * Propagate byes in double elimination bracket
 */
function propagateDoubleElimByes(bracket) {
  // Winners bracket propagation
  for (let round = 0; round < bracket.winnersMatches.length - 1; round++) {
    for (const match of bracket.winnersMatches[round]) {
      if (match.status === 'completed' && match.winnerId) {
        const nextRound = bracket.winnersMatches[round + 1];
        const nextMatch = nextRound.find(m => m.id === match.nextMatchId);

        if (nextMatch) {
          const slot = match.matchNumber % 2 === 1 ? 'participant1Id' : 'participant2Id';
          nextMatch[slot] = match.winnerId;
        }
      }
    }
  }
}

/**
 * Calculate where losers drop to in double elimination
 */
function calculateLoserMappings(bracket) {
  const { winnersRounds, losersRounds } = bracket;

  // Standard mapping for losers from winners bracket
  for (let wRound = 1; wRound <= winnersRounds; wRound++) {
    const wMatches = bracket.winnersMatches[wRound - 1];

    for (const match of wMatches) {
      // Calculate which losers round this feeds into
      const losersRound = wRound === 1 ? 1 : (wRound - 1) * 2;

      if (losersRound <= losersRounds && bracket.losersMatches[losersRound - 1]) {
        const lRoundMatches = bracket.losersMatches[losersRound - 1];
        const targetMatchIndex = (match.matchNumber - 1) % lRoundMatches.length;

        if (lRoundMatches[targetMatchIndex]) {
          match.loserNextMatchId = lRoundMatches[targetMatchIndex].id;
        }
      }
    }
  }
}
