import { BaseFormat } from './base-format.js';
import { generateDoubleEliminationBracket } from '../bracket-generator.js';
export class DoubleEliminationFormat extends BaseFormat {
    static get type() {
        return 'double-elimination';
    }
    static get displayName() {
        return 'Double Elimination (Chave Dupla)';
    }
    static get defaultConfig() {
        return {
            bestOf: 1,
            grandFinalsBestOf: 3,
            grandFinalsReset: true,
            seedingStrategy: 'bracket'
        };
    }
    validate(participants, _config) {
        const errors = [];
        if (!participants || participants.length < 2) {
            errors.push('Minimum 2 participants required');
        }
        if (participants.length > 128) {
            errors.push('Maximum 128 participants for double elimination');
        }
        return { valid: errors.length === 0, errors };
    }
    generateBracket(participants, config) {
        const bracket = generateDoubleEliminationBracket(participants, {
            bestOf: config.bestOf || 1,
            grandFinalsBestOf: config.grandFinalsBestOf || config.bestOf || 1,
            grandFinalsReset: config.grandFinalsReset !== false
        });
        bracket.config = { ...this.config, ...config };
        return bracket;
    }
    getInitialMatches(bracket) {
        const firstRound = bracket.winnersMatches[0];
        return firstRound
            .filter(m => m.status === 'pending')
            .map(match => ({
            ...this.createMatchTemplate({
                phase: 'winners',
                round: match.round,
                matchNumber: match.matchNumber,
                participant1Id: match.participant1Id,
                participant2Id: match.participant2Id,
                bestOf: match.bestOf,
                nextMatchId: match.nextMatchId,
                loserNextMatchId: match.loserNextMatchId
            }),
            id: match.id
        }));
    }
    onMatchComplete(bracket, completedMatch) {
        const newMatches = [];
        const { winnerId, loserId, id: matchId } = completedMatch;
        if (matchId.startsWith('WR')) {
            this._processWinnersMatch(bracket, completedMatch, newMatches);
        }
        else if (matchId.startsWith('LR')) {
            this._processLosersMatch(bracket, completedMatch, newMatches);
        }
        else if (matchId === 'GF') {
            this._processGrandFinals(bracket, completedMatch, newMatches);
        }
        else if (matchId === 'GF_RESET') {
            bracket.grandFinalsReset = null;
        }
        return { bracket, newMatches };
    }
    _processWinnersMatch(bracket, match, newMatches) {
        const { winnerId, loserId, nextMatchId, loserNextMatchId } = match;
        for (const round of bracket.winnersMatches) {
            const bracketMatch = round.find(m => m.id === match.id);
            if (bracketMatch) {
                bracketMatch.winnerId = winnerId;
                bracketMatch.loserId = loserId;
                bracketMatch.status = 'completed';
                break;
            }
        }
        if (nextMatchId && nextMatchId !== 'GF') {
            this._advanceInWinners(bracket, nextMatchId, winnerId, newMatches);
        }
        else if (nextMatchId === 'GF') {
            bracket.grandFinals.participant1Id = winnerId;
            this._checkGrandFinalsReady(bracket, newMatches);
        }
        if (loserId && loserNextMatchId) {
            this._dropToLosers(bracket, loserNextMatchId, loserId, newMatches);
        }
    }
    _processLosersMatch(bracket, match, newMatches) {
        const { winnerId, loserId, nextMatchId } = match;
        for (const round of bracket.losersMatches) {
            const bracketMatch = round.find(m => m.id === match.id);
            if (bracketMatch) {
                bracketMatch.winnerId = winnerId;
                bracketMatch.loserId = loserId;
                bracketMatch.status = 'completed';
                break;
            }
        }
        if (nextMatchId && nextMatchId !== 'GF') {
            this._advanceInLosers(bracket, nextMatchId, winnerId, newMatches);
        }
        else if (nextMatchId === 'GF') {
            bracket.grandFinals.participant2Id = winnerId;
            this._checkGrandFinalsReady(bracket, newMatches);
        }
    }
    _processGrandFinals(bracket, match, newMatches) {
        bracket.grandFinals.winnerId = match.winnerId;
        bracket.grandFinals.loserId = match.loserId;
        bracket.grandFinals.status = 'completed';
        if (bracket.grandFinalsReset && match.winnerId === bracket.grandFinals.participant2Id) {
            newMatches.push({
                ...this.createMatchTemplate({
                    phase: 'grand-finals-reset',
                    round: 2,
                    matchNumber: 1,
                    participant1Id: bracket.grandFinals.participant1Id,
                    participant2Id: bracket.grandFinals.participant2Id,
                    bestOf: this.config.grandFinalsBestOf
                }),
                id: 'GF_RESET'
            });
        }
    }
    _advanceInWinners(bracket, nextMatchId, participantId, newMatches) {
        const regexMatch = nextMatchId.match(/WR(\d+)M(\d+)/);
        const [, roundStr, matchStr] = regexMatch || [];
        if (!roundStr)
            return;
        const roundIndex = parseInt(roundStr) - 1;
        const matchIndex = parseInt(matchStr) - 1;
        const nextMatch = bracket.winnersMatches[roundIndex]?.[matchIndex];
        if (!nextMatch)
            return;
        if (!nextMatch.participant1Id) {
            nextMatch.participant1Id = participantId;
        }
        else if (!nextMatch.participant2Id) {
            nextMatch.participant2Id = participantId;
        }
        if (nextMatch.participant1Id && nextMatch.participant2Id) {
            newMatches.push({
                ...this.createMatchTemplate({
                    phase: 'winners',
                    round: nextMatch.round,
                    matchNumber: nextMatch.matchNumber,
                    participant1Id: nextMatch.participant1Id,
                    participant2Id: nextMatch.participant2Id,
                    bestOf: nextMatch.bestOf,
                    nextMatchId: nextMatch.nextMatchId,
                    loserNextMatchId: nextMatch.loserNextMatchId
                }),
                id: nextMatch.id
            });
        }
    }
    _advanceInLosers(bracket, nextMatchId, participantId, newMatches) {
        const regexMatch = nextMatchId.match(/LR(\d+)M(\d+)/);
        const [, roundStr, matchStr] = regexMatch || [];
        if (!roundStr)
            return;
        const roundIndex = parseInt(roundStr) - 1;
        const matchIndex = parseInt(matchStr) - 1;
        const nextMatch = bracket.losersMatches[roundIndex]?.[matchIndex];
        if (!nextMatch)
            return;
        if (!nextMatch.participant1Id) {
            nextMatch.participant1Id = participantId;
        }
        else if (!nextMatch.participant2Id) {
            nextMatch.participant2Id = participantId;
        }
        if (nextMatch.participant1Id && nextMatch.participant2Id) {
            newMatches.push({
                ...this.createMatchTemplate({
                    phase: 'losers',
                    round: nextMatch.round,
                    matchNumber: nextMatch.matchNumber,
                    participant1Id: nextMatch.participant1Id,
                    participant2Id: nextMatch.participant2Id,
                    bestOf: nextMatch.bestOf,
                    nextMatchId: nextMatch.nextMatchId
                }),
                id: nextMatch.id
            });
        }
    }
    _dropToLosers(bracket, loserMatchId, participantId, newMatches) {
        const regexMatch = loserMatchId.match(/LR(\d+)M(\d+)/);
        const [, roundStr, matchStr] = regexMatch || [];
        if (!roundStr)
            return;
        const roundIndex = parseInt(roundStr) - 1;
        const matchIndex = parseInt(matchStr) - 1;
        const loserMatch = bracket.losersMatches[roundIndex]?.[matchIndex];
        if (!loserMatch)
            return;
        if (!loserMatch.participant1Id) {
            loserMatch.participant1Id = participantId;
        }
        else if (!loserMatch.participant2Id) {
            loserMatch.participant2Id = participantId;
        }
        if (loserMatch.participant1Id && loserMatch.participant2Id) {
            newMatches.push({
                ...this.createMatchTemplate({
                    phase: 'losers',
                    round: loserMatch.round,
                    matchNumber: loserMatch.matchNumber,
                    participant1Id: loserMatch.participant1Id,
                    participant2Id: loserMatch.participant2Id,
                    bestOf: loserMatch.bestOf,
                    nextMatchId: loserMatch.nextMatchId
                }),
                id: loserMatch.id
            });
        }
    }
    _checkGrandFinalsReady(bracket, newMatches) {
        const gf = bracket.grandFinals;
        if (gf.participant1Id && gf.participant2Id) {
            newMatches.push({
                ...this.createMatchTemplate({
                    phase: 'grand-finals',
                    round: 1,
                    matchNumber: 1,
                    participant1Id: gf.participant1Id,
                    participant2Id: gf.participant2Id,
                    bestOf: this.config.grandFinalsBestOf
                }),
                id: 'GF'
            });
        }
    }
    getStandings(bracket, matches) {
        const standings = [];
        const processed = new Set();
        if (bracket.grandFinals?.status === 'completed') {
            const gf = matches.find(m => m.id === 'GF' || m.id === 'GF_RESET');
            if (gf?.winnerId) {
                standings.push({
                    participantId: gf.winnerId,
                    placement: 1,
                    eliminatedPhase: null
                });
                processed.add(gf.winnerId);
                if (gf.loserId && !processed.has(gf.loserId)) {
                    standings.push({
                        participantId: gf.loserId,
                        placement: 2,
                        eliminatedPhase: 'grand-finals'
                    });
                    processed.add(gf.loserId);
                }
            }
        }
        const loserMatches = matches
            .filter(m => m.phase === 'losers' && m.status === 'completed')
            .sort((a, b) => b.round - a.round);
        for (const match of loserMatches) {
            if (match.loserId && !processed.has(match.loserId)) {
                standings.push({
                    participantId: match.loserId,
                    placement: standings.length + 1,
                    eliminatedPhase: 'losers',
                    eliminatedRound: match.round
                });
                processed.add(match.loserId);
            }
        }
        return standings;
    }
    isComplete(bracket, matches) {
        const gf = matches.find(m => m.id === 'GF');
        if (!gf || gf.status !== 'completed')
            return false;
        if (bracket.grandFinalsReset && gf.winnerId === bracket.grandFinals.participant2Id) {
            const reset = matches.find(m => m.id === 'GF_RESET');
            return reset?.status === 'completed';
        }
        return true;
    }
    getWinner(bracket, matches) {
        if (!this.isComplete(bracket, matches))
            return null;
        const reset = matches.find(m => m.id === 'GF_RESET');
        if (reset?.status === 'completed') {
            return reset.winnerId;
        }
        const gf = matches.find(m => m.id === 'GF');
        return gf?.winnerId || null;
    }
    getCurrentPhase(bracket, _matches) {
        const hasLosersComplete = bracket.losersMatches.flat().every(m => m.status === 'completed');
        const hasWinnersComplete = bracket.winnersMatches.flat().every(m => m.status === 'completed');
        if (hasWinnersComplete && hasLosersComplete)
            return 'grand-finals';
        if (hasWinnersComplete)
            return 'losers-finals';
        return 'bracket';
    }
    getCurrentRound(bracket, _matches) {
        const allMatches = [
            ...bracket.winnersMatches.flat(),
            ...bracket.losersMatches.flat()
        ];
        const pendingMatches = allMatches.filter(m => m.status !== 'completed');
        if (pendingMatches.length === 0)
            return bracket.winnersRounds + bracket.losersRounds;
        return Math.min(...pendingMatches.map(m => m.round));
    }
}
//# sourceMappingURL=double-elimination.js.map