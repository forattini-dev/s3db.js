/**
 * Ladder Format
 * Ranking-based system with challenges
 * Used in online qualifiers, FGC, ranked play
 */
import { BaseFormat } from './base-format.js';
import { calculateLadderRankings } from '../standings-calculator.js';

export class LadderFormat extends BaseFormat {
  static get type() {
    return 'ladder';
  }

  static get displayName() {
    return 'Ladder (Ranking/Desafios)';
  }

  static get defaultConfig() {
    return {
      bestOf: 1,
      initialRating: 1000,
      kFactor: 32,               // ELO K-factor
      challengeRange: 5,         // Can challenge up to N positions above
      challengeCooldown: 86400000, // 24 hours cooldown after challenge
      protectionPeriod: 86400000,  // 24 hours protection after defending
      maxActiveChallenges: 1,    // Max pending challenges per participant
      autoQualifyTop: 0,         // Top N automatically qualify (for qualifiers)
      seasonDuration: null       // null = ongoing, or duration in ms
    };
  }

  validate(participants, config) {
    const errors = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    if (config.challengeRange && config.challengeRange < 1) {
      errors.push('Challenge range must be at least 1');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants, config) {
    // Initialize ladder rankings
    const rankings = participants.map((participantId, index) => ({
      participantId,
      rank: index + 1,
      rating: config.initialRating || 1000,
      wins: 0,
      losses: 0,
      challengesMade: 0,
      challengesReceived: 0,
      lastChallengeAt: null,
      lastDefendAt: null,
      protectedUntil: null
    }));

    return {
      type: 'ladder',
      config: { ...this.config, ...config },
      rankings,
      pendingChallenges: [],
      challengeHistory: [],
      startedAt: Date.now(),
      seasonEndsAt: config.seasonDuration ? Date.now() + config.seasonDuration : null
    };
  }

  getInitialMatches(bracket) {
    // Ladder doesn't have initial matches - they are created via challenges
    return [];
  }

  onMatchComplete(bracket, completedMatch) {
    const { winnerId, loserId } = completedMatch;
    const newMatches = [];

    // Find rankings
    const winnerRanking = bracket.rankings.find(r => r.participantId === winnerId);
    const loserRanking = bracket.rankings.find(r => r.participantId === loserId);

    if (!winnerRanking || !loserRanking) {
      return { bracket, newMatches };
    }

    // Update stats
    winnerRanking.wins++;
    loserRanking.losses++;

    // ELO rating update
    const kFactor = bracket.config.kFactor || 32;
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRanking.rating - winnerRanking.rating) / 400));
    const expectedLoser = 1 - expectedWinner;

    winnerRanking.rating = Math.round(winnerRanking.rating + kFactor * (1 - expectedWinner));
    loserRanking.rating = Math.round(loserRanking.rating + kFactor * (0 - expectedLoser));

    // Rank swap if challenger wins against higher-ranked
    if (loserRanking.rank < winnerRanking.rank) {
      // Challenger (winner) takes defender's (loser) rank
      const tempRank = loserRanking.rank;
      loserRanking.rank = winnerRanking.rank;
      winnerRanking.rank = tempRank;
    }

    // Apply protection period to the defender (winner if they held rank)
    if (completedMatch.metadata?.challengerId === loserId) {
      // Defender successfully defended
      winnerRanking.protectedUntil = Date.now() + (bracket.config.protectionPeriod || 86400000);
      winnerRanking.lastDefendAt = Date.now();
    }

    // Remove from pending challenges
    const challengeIndex = bracket.pendingChallenges.findIndex(c =>
      c.matchId === completedMatch.id
    );
    if (challengeIndex >= 0) {
      const challenge = bracket.pendingChallenges.splice(challengeIndex, 1)[0];
      bracket.challengeHistory.push({
        ...challenge,
        winnerId,
        loserId,
        completedAt: Date.now()
      });
    }

    // Update cooldowns
    const challenger = bracket.rankings.find(r =>
      r.participantId === completedMatch.metadata?.challengerId
    );
    if (challenger) {
      challenger.lastChallengeAt = Date.now();
    }

    // Re-sort rankings by rank
    bracket.rankings.sort((a, b) => a.rank - b.rank);

    return { bracket, newMatches };
  }

  /**
   * Create a challenge
   * @param {Object} bracket - Current bracket
   * @param {string} challengerId - Challenger participant ID
   * @param {string} defenderId - Defender participant ID
   * @returns {{ valid: boolean, error?: string, match?: Object }}
   */
  createChallenge(bracket, challengerId, defenderId) {
    const challengerRanking = bracket.rankings.find(r => r.participantId === challengerId);
    const defenderRanking = bracket.rankings.find(r => r.participantId === defenderId);

    if (!challengerRanking || !defenderRanking) {
      return { valid: false, error: 'Participant not found' };
    }

    // Validate challenge
    const validation = this.validateChallenge(bracket, challengerRanking, defenderRanking);
    if (!validation.valid) {
      return validation;
    }

    // Create match
    const matchId = `L${Date.now()}_${challengerId.slice(0, 4)}v${defenderId.slice(0, 4)}`;
    const match = {
      id: matchId,
      phase: 'ladder',
      round: bracket.challengeHistory.length + bracket.pendingChallenges.length + 1,
      matchNumber: 1,
      participant1Id: challengerId,
      participant2Id: defenderId,
      bestOf: bracket.config.bestOf || 1,
      status: 'pending',
      metadata: {
        challengerId,
        defenderId,
        challengerRank: challengerRanking.rank,
        defenderRank: defenderRanking.rank,
        createdAt: Date.now()
      }
    };

    // Add to pending
    bracket.pendingChallenges.push({
      matchId,
      challengerId,
      defenderId,
      challengerRank: challengerRanking.rank,
      defenderRank: defenderRanking.rank,
      createdAt: Date.now()
    });

    // Update challenger stats
    challengerRanking.challengesMade++;
    defenderRanking.challengesReceived++;

    return { valid: true, match };
  }

  validateChallenge(bracket, challenger, defender) {
    const config = bracket.config;
    const now = Date.now();

    // Cannot challenge yourself
    if (challenger.participantId === defender.participantId) {
      return { valid: false, error: 'Cannot challenge yourself' };
    }

    // Must challenge someone ranked higher
    if (defender.rank >= challenger.rank) {
      return { valid: false, error: 'Can only challenge higher-ranked participants' };
    }

    // Check challenge range
    const rankDiff = challenger.rank - defender.rank;
    if (rankDiff > (config.challengeRange || 5)) {
      return { valid: false, error: `Can only challenge up to ${config.challengeRange} positions above` };
    }

    // Check cooldown
    if (challenger.lastChallengeAt) {
      const cooldown = config.challengeCooldown || 86400000;
      if (now - challenger.lastChallengeAt < cooldown) {
        const remaining = Math.ceil((cooldown - (now - challenger.lastChallengeAt)) / 60000);
        return { valid: false, error: `Challenge cooldown: ${remaining} minutes remaining` };
      }
    }

    // Check defender protection
    if (defender.protectedUntil && now < defender.protectedUntil) {
      const remaining = Math.ceil((defender.protectedUntil - now) / 60000);
      return { valid: false, error: `Defender is protected for ${remaining} more minutes` };
    }

    // Check max active challenges
    const activeChallenges = bracket.pendingChallenges.filter(c =>
      c.challengerId === challenger.participantId
    );
    if (activeChallenges.length >= (config.maxActiveChallenges || 1)) {
      return { valid: false, error: 'Maximum active challenges reached' };
    }

    // Check if already challenging this person
    const existingChallenge = bracket.pendingChallenges.find(c =>
      c.challengerId === challenger.participantId && c.defenderId === defender.participantId
    );
    if (existingChallenge) {
      return { valid: false, error: 'Already have a pending challenge against this participant' };
    }

    return { valid: true };
  }

  getStandings(bracket, matches) {
    return calculateLadderRankings(bracket.rankings, matches);
  }

  isComplete(bracket, matches) {
    // Ladder is complete when season ends
    if (bracket.seasonEndsAt && Date.now() >= bracket.seasonEndsAt) {
      return true;
    }
    return false; // Ongoing ladder
  }

  getWinner(bracket, matches) {
    if (!this.isComplete(bracket, matches)) return null;

    const standings = this.getStandings(bracket, matches);
    return standings.length > 0 ? standings[0].participantId : null;
  }

  getCurrentPhase(bracket, matches) {
    return 'ladder';
  }

  getCurrentRound(bracket, matches) {
    return bracket.challengeHistory.length + bracket.pendingChallenges.length;
  }

  getRankings(bracket) {
    return [...bracket.rankings].sort((a, b) => a.rank - b.rank);
  }

  getPendingChallenges(bracket) {
    return bracket.pendingChallenges;
  }

  getParticipantChallenges(bracket, participantId) {
    return {
      pending: bracket.pendingChallenges.filter(c =>
        c.challengerId === participantId || c.defenderId === participantId
      ),
      history: bracket.challengeHistory.filter(c =>
        c.challengerId === participantId || c.defenderId === participantId
      )
    };
  }

  canChallenge(bracket, challengerId, defenderId) {
    const challenger = bracket.rankings.find(r => r.participantId === challengerId);
    const defender = bracket.rankings.find(r => r.participantId === defenderId);

    if (!challenger || !defender) return { can: false, reason: 'Participant not found' };

    const validation = this.validateChallenge(bracket, challenger, defender);
    return { can: validation.valid, reason: validation.error };
  }
}
