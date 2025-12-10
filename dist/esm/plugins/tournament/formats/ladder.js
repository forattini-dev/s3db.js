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
            kFactor: 32,
            challengeRange: 5,
            challengeCooldown: 86400000,
            protectionPeriod: 86400000,
            maxActiveChallenges: 1,
            autoQualifyTop: 0,
            seasonDuration: null
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
        const ladderConfig = config;
        const rankings = participants.map((participantId, index) => ({
            participantId,
            rank: index + 1,
            rating: (ladderConfig.initialRating ?? 1000),
            wins: 0,
            losses: 0,
            streak: 0,
            lastActivity: Date.now(),
            challengesMade: 0,
            challengesReceived: 0,
            lastChallengeAt: null,
            lastDefendAt: null,
            protectedUntil: undefined
        }));
        return {
            type: 'ladder',
            config: { ...this.config, ...config },
            rankings,
            pendingChallenges: [],
            challengeHistory: [],
            startedAt: Date.now(),
            seasonEndsAt: ladderConfig.seasonDuration ? Date.now() + ladderConfig.seasonDuration : null
        };
    }
    getInitialMatches(_bracket) {
        return [];
    }
    onMatchComplete(bracket, completedMatch) {
        const ladderBracket = bracket;
        const { winnerId, loserId } = completedMatch;
        const newMatches = [];
        const winnerRanking = ladderBracket.rankings.find(r => r.participantId === winnerId);
        const loserRanking = ladderBracket.rankings.find(r => r.participantId === loserId);
        if (!winnerRanking || !loserRanking) {
            return { bracket: ladderBracket, newMatches };
        }
        winnerRanking.wins++;
        loserRanking.losses++;
        const kFactor = ladderBracket.config.kFactor || 32;
        const expectedWinner = 1 / (1 + Math.pow(10, (loserRanking.rating - winnerRanking.rating) / 400));
        const expectedLoser = 1 - expectedWinner;
        winnerRanking.rating = Math.round(winnerRanking.rating + kFactor * (1 - expectedWinner));
        loserRanking.rating = Math.round(loserRanking.rating + kFactor * (0 - expectedLoser));
        if (loserRanking.rank < winnerRanking.rank) {
            const tempRank = loserRanking.rank;
            loserRanking.rank = winnerRanking.rank;
            winnerRanking.rank = tempRank;
        }
        if (completedMatch.metadata?.challengerId === loserId) {
            winnerRanking.protectedUntil = Date.now() + (ladderBracket.config.protectionPeriod || 86400000);
            winnerRanking.lastDefendAt = Date.now();
        }
        const challengeIndex = ladderBracket.pendingChallenges.findIndex(c => c.matchId === completedMatch.id);
        if (challengeIndex >= 0) {
            const challenge = ladderBracket.pendingChallenges.splice(challengeIndex, 1)[0];
            ladderBracket.challengeHistory.push({
                ...challenge,
                winnerId: winnerId,
                loserId: loserId,
                completedAt: Date.now()
            });
        }
        const challenger = ladderBracket.rankings.find(r => r.participantId === completedMatch.metadata?.challengerId);
        if (challenger) {
            challenger.lastChallengeAt = Date.now();
        }
        ladderBracket.rankings.sort((a, b) => a.rank - b.rank);
        return { bracket: ladderBracket, newMatches };
    }
    createChallenge(bracket, challengerId, defenderId) {
        const ladderBracket = bracket;
        const challengerRanking = ladderBracket.rankings.find(r => r.participantId === challengerId);
        const defenderRanking = ladderBracket.rankings.find(r => r.participantId === defenderId);
        if (!challengerRanking || !defenderRanking) {
            return { valid: false, error: 'Participant not found' };
        }
        const validation = this.validateChallenge(ladderBracket, challengerRanking, defenderRanking);
        if (!validation.valid) {
            return validation;
        }
        const matchId = `L${Date.now()}_${challengerId.slice(0, 4)}v${defenderId.slice(0, 4)}`;
        const match = {
            id: matchId,
            phase: 'ladder',
            round: ladderBracket.challengeHistory.length + ladderBracket.pendingChallenges.length + 1,
            matchNumber: 1,
            participant1Id: challengerId,
            participant2Id: defenderId,
            bestOf: ladderBracket.config.bestOf || 1,
            score1: 0,
            score2: 0,
            games: [],
            winnerId: null,
            loserId: null,
            status: 'pending',
            nextMatchId: null,
            groupId: null,
            scheduledAt: null,
            startedAt: null,
            completedAt: null,
            metadata: {
                challengerId,
                defenderId,
                challengerRank: challengerRanking.rank,
                defenderRank: defenderRanking.rank,
                createdAt: Date.now()
            }
        };
        ladderBracket.pendingChallenges.push({
            matchId,
            challengerId,
            defenderId,
            challengerRank: challengerRanking.rank,
            defenderRank: defenderRanking.rank,
            createdAt: Date.now()
        });
        challengerRanking.challengesMade = (challengerRanking.challengesMade || 0) + 1;
        defenderRanking.challengesReceived = (defenderRanking.challengesReceived || 0) + 1;
        return { valid: true, match };
    }
    validateChallenge(bracket, challenger, defender) {
        const config = bracket.config;
        const now = Date.now();
        if (challenger.participantId === defender.participantId) {
            return { valid: false, error: 'Cannot challenge yourself' };
        }
        if (defender.rank >= challenger.rank) {
            return { valid: false, error: 'Can only challenge higher-ranked participants' };
        }
        const rankDiff = challenger.rank - defender.rank;
        if (rankDiff > (config.challengeRange || 5)) {
            return { valid: false, error: `Can only challenge up to ${config.challengeRange} positions above` };
        }
        if (challenger.lastChallengeAt) {
            const cooldown = config.challengeCooldown || 86400000;
            if (now - challenger.lastChallengeAt < cooldown) {
                const remaining = Math.ceil((cooldown - (now - challenger.lastChallengeAt)) / 60000);
                return { valid: false, error: `Challenge cooldown: ${remaining} minutes remaining` };
            }
        }
        if (defender.protectedUntil && now < defender.protectedUntil) {
            const remaining = Math.ceil((defender.protectedUntil - now) / 60000);
            return { valid: false, error: `Defender is protected for ${remaining} more minutes` };
        }
        const activeChallenges = bracket.pendingChallenges.filter(c => c.challengerId === challenger.participantId);
        if (activeChallenges.length >= (config.maxActiveChallenges || 1)) {
            return { valid: false, error: 'Maximum active challenges reached' };
        }
        const existingChallenge = bracket.pendingChallenges.find(c => c.challengerId === challenger.participantId && c.defenderId === defender.participantId);
        if (existingChallenge) {
            return { valid: false, error: 'Already have a pending challenge against this participant' };
        }
        return { valid: true };
    }
    getStandings(bracket, _matches) {
        const ladderBracket = bracket;
        return calculateLadderRankings(ladderBracket.rankings);
    }
    isComplete(bracket, _matches) {
        const ladderBracket = bracket;
        if (ladderBracket.seasonEndsAt && Date.now() >= ladderBracket.seasonEndsAt) {
            return true;
        }
        return false;
    }
    getWinner(bracket, matches) {
        if (!this.isComplete(bracket, matches))
            return null;
        const standings = this.getStandings(bracket, matches);
        return standings.length > 0 ? standings[0].participantId : null;
    }
    getCurrentPhase(_bracket, _matches) {
        return 'ladder';
    }
    getCurrentRound(bracket, _matches) {
        const ladderBracket = bracket;
        return ladderBracket.challengeHistory.length + ladderBracket.pendingChallenges.length;
    }
    getRankings(bracket) {
        const ladderBracket = bracket;
        return [...ladderBracket.rankings].sort((a, b) => a.rank - b.rank);
    }
    getPendingChallenges(bracket) {
        return bracket.pendingChallenges;
    }
    getParticipantChallenges(bracket, participantId) {
        const ladderBracket = bracket;
        return {
            pending: ladderBracket.pendingChallenges.filter(c => c.challengerId === participantId || c.defenderId === participantId),
            history: ladderBracket.challengeHistory.filter(c => c.challengerId === participantId || c.defenderId === participantId)
        };
    }
    canChallenge(bracket, challengerId, defenderId) {
        const ladderBracket = bracket;
        const challenger = ladderBracket.rankings.find(r => r.participantId === challengerId);
        const defender = ladderBracket.rankings.find(r => r.participantId === defenderId);
        if (!challenger || !defender)
            return { can: false, reason: 'Participant not found' };
        const validation = this.validateChallenge(ladderBracket, challenger, defender);
        return { can: validation.valid, reason: validation.error };
    }
}
//# sourceMappingURL=ladder.js.map