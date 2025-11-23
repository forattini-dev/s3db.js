/**
 * Standings Calculator
 * Calculates rankings and statistics for tournament participants
 */

/**
 * Calculate standings for round-robin style tournaments
 * @param {Array<string>} participants - List of participant IDs
 * @param {Array<Object>} matches - All matches
 * @param {Object} config - Points configuration
 * @returns {Array<Object>} Sorted standings
 */
export function calculateRoundRobinStandings(participants, matches, config = {}) {
  const { pointsWin = 3, pointsDraw = 1, pointsLoss = 0 } = config;

  const stats = new Map();

  // Initialize stats for all participants
  for (const participantId of participants) {
    stats.set(participantId, {
      participantId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      matchHistory: []
    });
  }

  // Process completed matches
  const completedMatches = matches.filter(m => m.status === 'completed');

  for (const match of completedMatches) {
    const { participant1Id, participant2Id, score1, score2, winnerId } = match;

    if (!participant1Id || !participant2Id) continue;

    const stat1 = stats.get(participant1Id);
    const stat2 = stats.get(participant2Id);

    if (!stat1 || !stat2) continue;

    // Update played count
    stat1.played++;
    stat2.played++;

    // Update goals
    stat1.goalsFor += score1;
    stat1.goalsAgainst += score2;
    stat2.goalsFor += score2;
    stat2.goalsAgainst += score1;

    // Update goal difference
    stat1.goalDifference = stat1.goalsFor - stat1.goalsAgainst;
    stat2.goalDifference = stat2.goalsFor - stat2.goalsAgainst;

    // Determine result
    if (score1 > score2) {
      stat1.wins++;
      stat1.points += pointsWin;
      stat2.losses++;
      stat2.points += pointsLoss;
      stat1.matchHistory.push({ opponent: participant2Id, result: 'W', score: `${score1}-${score2}` });
      stat2.matchHistory.push({ opponent: participant1Id, result: 'L', score: `${score2}-${score1}` });
    } else if (score2 > score1) {
      stat2.wins++;
      stat2.points += pointsWin;
      stat1.losses++;
      stat1.points += pointsLoss;
      stat1.matchHistory.push({ opponent: participant2Id, result: 'L', score: `${score1}-${score2}` });
      stat2.matchHistory.push({ opponent: participant1Id, result: 'W', score: `${score2}-${score1}` });
    } else {
      stat1.draws++;
      stat2.draws++;
      stat1.points += pointsDraw;
      stat2.points += pointsDraw;
      stat1.matchHistory.push({ opponent: participant2Id, result: 'D', score: `${score1}-${score2}` });
      stat2.matchHistory.push({ opponent: participant1Id, result: 'D', score: `${score2}-${score1}` });
    }
  }

  // Sort standings
  return sortStandings(Array.from(stats.values()));
}

/**
 * Calculate standings for elimination brackets
 * @param {Array<Object>} matches - All matches
 * @param {Object} bracket - Bracket structure
 * @returns {Array<Object>} Standings based on elimination round
 */
export function calculateEliminationStandings(matches, bracket) {
  const standings = new Map();
  const completedMatches = matches.filter(m => m.status === 'completed');

  for (const match of completedMatches) {
    const { participant1Id, participant2Id, winnerId, loserId, round } = match;

    // Winner advances
    if (winnerId && !standings.has(winnerId)) {
      standings.set(winnerId, {
        participantId: winnerId,
        eliminatedRound: null,
        bestRound: round,
        wins: 0,
        losses: 0
      });
    }
    if (winnerId) {
      const winnerStat = standings.get(winnerId);
      winnerStat.wins++;
      winnerStat.bestRound = Math.max(winnerStat.bestRound || 0, round);
    }

    // Loser is eliminated
    if (loserId && !standings.has(loserId)) {
      standings.set(loserId, {
        participantId: loserId,
        eliminatedRound: round,
        bestRound: round,
        wins: 0,
        losses: 0
      });
    }
    if (loserId) {
      const loserStat = standings.get(loserId);
      loserStat.losses++;
      loserStat.eliminatedRound = round;
    }
  }

  // Sort by best round achieved (higher is better), then by wins
  return Array.from(standings.values()).sort((a, b) => {
    if (a.eliminatedRound === null && b.eliminatedRound !== null) return -1;
    if (b.eliminatedRound === null && a.eliminatedRound !== null) return 1;
    if (b.bestRound !== a.bestRound) return b.bestRound - a.bestRound;
    return b.wins - a.wins;
  });
}

/**
 * Calculate Swiss standings
 * @param {Array<string>} participants - List of participant IDs
 * @param {Array<Object>} matches - All matches
 * @param {Object} config - Swiss configuration
 * @returns {Array<Object>} Sorted standings
 */
export function calculateSwissStandings(participants, matches, config = {}) {
  const stats = new Map();

  for (const participantId of participants) {
    stats.set(participantId, {
      participantId,
      wins: 0,
      losses: 0,
      matchWins: 0, // Individual game wins in Bo series
      matchLosses: 0,
      buchholz: 0, // Sum of opponents' wins (tiebreaker)
      opponents: []
    });
  }

  const completedMatches = matches.filter(m => m.status === 'completed');

  for (const match of completedMatches) {
    const { participant1Id, participant2Id, score1, score2, winnerId } = match;

    if (!participant1Id || !participant2Id) continue;

    const stat1 = stats.get(participant1Id);
    const stat2 = stats.get(participant2Id);

    if (!stat1 || !stat2) continue;

    // Track opponents for Buchholz
    stat1.opponents.push(participant2Id);
    stat2.opponents.push(participant1Id);

    // Track individual game scores
    stat1.matchWins += score1;
    stat1.matchLosses += score2;
    stat2.matchWins += score2;
    stat2.matchLosses += score1;

    // Track match wins/losses
    if (winnerId === participant1Id) {
      stat1.wins++;
      stat2.losses++;
    } else if (winnerId === participant2Id) {
      stat2.wins++;
      stat1.losses++;
    }
  }

  // Calculate Buchholz scores (sum of opponents' wins)
  for (const stat of stats.values()) {
    stat.buchholz = stat.opponents.reduce((sum, oppId) => {
      const oppStat = stats.get(oppId);
      return sum + (oppStat ? oppStat.wins : 0);
    }, 0);
  }

  // Sort by wins, then Buchholz, then game difference
  return Array.from(stats.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    const diffA = a.matchWins - a.matchLosses;
    const diffB = b.matchWins - b.matchLosses;
    return diffB - diffA;
  });
}

/**
 * Calculate ladder rankings
 * @param {Array<Object>} participants - Participants with current rank/rating
 * @param {Array<Object>} matches - All matches
 * @returns {Array<Object>} Updated rankings
 */
export function calculateLadderRankings(participants, matches) {
  const rankings = new Map();

  // Initialize with current rankings
  for (const p of participants) {
    rankings.set(p.participantId, {
      participantId: p.participantId,
      rank: p.rank || participants.indexOf(p) + 1,
      rating: p.rating || 1000,
      wins: 0,
      losses: 0
    });
  }

  // Process matches chronologically
  const sortedMatches = [...matches]
    .filter(m => m.status === 'completed')
    .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));

  for (const match of sortedMatches) {
    const { winnerId, loserId } = match;

    const winnerRank = rankings.get(winnerId);
    const loserRank = rankings.get(loserId);

    if (!winnerRank || !loserRank) continue;

    winnerRank.wins++;
    loserRank.losses++;

    // ELO-style rating adjustment
    const kFactor = 32;
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRank.rating - winnerRank.rating) / 400));
    const expectedLoser = 1 - expectedWinner;

    winnerRank.rating = Math.round(winnerRank.rating + kFactor * (1 - expectedWinner));
    loserRank.rating = Math.round(loserRank.rating + kFactor * (0 - expectedLoser));

    // Rank swap if challenger wins against higher-ranked
    if (loserRank.rank < winnerRank.rank) {
      const tempRank = loserRank.rank;
      loserRank.rank = winnerRank.rank;
      winnerRank.rank = tempRank;
    }
  }

  // Sort by rank
  return Array.from(rankings.values()).sort((a, b) => a.rank - b.rank);
}

/**
 * Calculate circuit points standings
 * @param {Array<Object>} events - Circuit events with results
 * @param {Object} config - Points distribution config
 * @returns {Array<Object>} Circuit standings
 */
export function calculateCircuitStandings(events, config = {}) {
  const pointsTable = config.pointsTable || {
    1: 100, 2: 75, 3: 50, 4: 40, 5: 32, 6: 24, 7: 18, 8: 12
  };

  const standings = new Map();

  for (const event of events) {
    const multiplier = event.pointsMultiplier || 1;

    for (const result of event.results || []) {
      const { participantId, placement } = result;

      if (!standings.has(participantId)) {
        standings.set(participantId, {
          participantId,
          totalPoints: 0,
          events: [],
          bestPlacements: []
        });
      }

      const stat = standings.get(participantId);
      const points = (pointsTable[placement] || 0) * multiplier;

      stat.totalPoints += points;
      stat.events.push({
        eventId: event.id,
        eventName: event.name,
        placement,
        points
      });
      stat.bestPlacements.push(placement);
    }
  }

  // Sort by total points
  return Array.from(standings.values())
    .map(s => ({
      ...s,
      bestPlacements: s.bestPlacements.sort((a, b) => a - b).slice(0, 3)
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

/**
 * Sort standings array
 * @param {Array<Object>} standings - Standings to sort
 * @returns {Array<Object>}
 */
export function sortStandings(standings) {
  return standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return 0;
  });
}

/**
 * Apply head-to-head tiebreaker
 * @param {Array<Object>} tiedParticipants - Participants with same points
 * @param {Array<Object>} matches - All matches
 * @returns {Array<Object>} Sorted by head-to-head
 */
export function applyHeadToHead(tiedParticipants, matches) {
  if (tiedParticipants.length <= 1) return tiedParticipants;

  const ids = new Set(tiedParticipants.map(p => p.participantId));
  const h2hStats = new Map();

  for (const p of tiedParticipants) {
    h2hStats.set(p.participantId, { ...p, h2hPoints: 0, h2hGoalDiff: 0 });
  }

  // Only consider matches between tied participants
  const h2hMatches = matches.filter(m =>
    m.status === 'completed' &&
    ids.has(m.participant1Id) &&
    ids.has(m.participant2Id)
  );

  for (const match of h2hMatches) {
    const stat1 = h2hStats.get(match.participant1Id);
    const stat2 = h2hStats.get(match.participant2Id);

    stat1.h2hGoalDiff += match.score1 - match.score2;
    stat2.h2hGoalDiff += match.score2 - match.score1;

    if (match.score1 > match.score2) {
      stat1.h2hPoints += 3;
    } else if (match.score2 > match.score1) {
      stat2.h2hPoints += 3;
    } else {
      stat1.h2hPoints += 1;
      stat2.h2hPoints += 1;
    }
  }

  return Array.from(h2hStats.values()).sort((a, b) => {
    if (b.h2hPoints !== a.h2hPoints) return b.h2hPoints - a.h2hPoints;
    return b.h2hGoalDiff - a.h2hGoalDiff;
  });
}
