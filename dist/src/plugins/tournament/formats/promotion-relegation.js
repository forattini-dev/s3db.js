import { BaseFormat } from './base-format.js';
import { RoundRobinFormat } from './round-robin.js';
export class PromotionRelegationFormat extends BaseFormat {
    static get type() {
        return 'promotion-relegation';
    }
    static get displayName() {
        return 'Promotion/Relegation (Divisões)';
    }
    static get defaultConfig() {
        return {
            divisions: 2,
            teamsPerDivision: 10,
            rounds: 2,
            bestOf: 1,
            promotionSpots: 2,
            relegationSpots: 2,
            playoffSpots: 0,
            pointsWin: 3,
            pointsDraw: 1,
            pointsLoss: 0,
            seasonDuration: null
        };
    }
    validate(participants, config) {
        const errors = [];
        const divisions = config.divisions || 2;
        const perDivision = config.teamsPerDivision || 10;
        const totalNeeded = divisions * perDivision;
        if (!participants || participants.length < totalNeeded) {
            errors.push(`Need ${totalNeeded} participants for ${divisions} divisions with ${perDivision} teams each`);
        }
        if (config.promotionSpots && config.promotionSpots >= perDivision / 2) {
            errors.push('Promotion spots too high');
        }
        return { valid: errors.length === 0, errors };
    }
    generateBracket(participants, config) {
        const prConfig = config;
        const divisions = prConfig.divisions || 2;
        const perDivision = prConfig.teamsPerDivision || Math.ceil(participants.length / divisions);
        const divisionBrackets = [];
        for (let i = 0; i < divisions; i++) {
            const divisionParticipants = participants.slice(i * perDivision, (i + 1) * perDivision);
            const leagueFormat = new RoundRobinFormat({
                rounds: prConfig.rounds || 2,
                bestOf: prConfig.bestOf || 1,
                pointsWin: prConfig.pointsWin,
                pointsDraw: prConfig.pointsDraw,
                pointsLoss: prConfig.pointsLoss
            });
            divisionBrackets.push({
                divisionId: i + 1,
                divisionName: this._getDivisionName(i),
                participants: divisionParticipants,
                bracket: leagueFormat.generateBracket(divisionParticipants, config),
                standings: [],
                complete: false
            });
        }
        return {
            type: 'promotion-relegation',
            config: { ...this.config, ...config },
            divisions: divisionBrackets,
            promotions: [],
            relegations: [],
            playoffMatches: [],
            season: 1,
            seasonStartedAt: Date.now(),
            seasonComplete: false
        };
    }
    _getDivisionName(index) {
        const names = ['Premier', 'Championship', 'League One', 'League Two', 'National'];
        return names[index] || `Division ${index + 1}`;
    }
    getInitialMatches(bracket) {
        const prBracket = bracket;
        const matches = [];
        for (const division of prBracket.divisions) {
            const leagueFormat = new RoundRobinFormat(division.bracket.config);
            const divisionMatches = leagueFormat.getInitialMatches(division.bracket);
            for (const match of divisionMatches) {
                matches.push({
                    ...match,
                    id: `D${division.divisionId}_${match.id}`,
                    metadata: {
                        ...match.metadata,
                        divisionId: division.divisionId,
                        divisionName: division.divisionName
                    }
                });
            }
        }
        return matches;
    }
    onMatchComplete(bracket, completedMatch) {
        const prBracket = bracket;
        const divisionId = completedMatch.metadata?.divisionId || parseInt(completedMatch.id.split('_')[0].replace('D', ''));
        const division = prBracket.divisions.find(d => d.divisionId === divisionId);
        const newMatches = [];
        if (!division)
            return { bracket: prBracket, newMatches };
        const leagueFormat = new RoundRobinFormat(division.bracket.config);
        const strippedMatch = {
            ...completedMatch,
            id: completedMatch.id.replace(`D${divisionId}_`, '')
        };
        const { bracket: updatedDivisionBracket, newMatches: divisionNewMatches } = leagueFormat.onMatchComplete(division.bracket, strippedMatch);
        division.bracket = updatedDivisionBracket;
        const allMatches = division.bracket.schedule.flatMap(r => r.matches);
        const completedCount = allMatches.filter(m => m.status === 'completed').length;
        if (completedCount >= allMatches.length) {
            division.complete = true;
            division.standings = leagueFormat.getStandings(division.bracket, allMatches);
        }
        for (const match of divisionNewMatches) {
            newMatches.push({
                ...match,
                id: `D${divisionId}_${match.id}`,
                metadata: {
                    ...match.metadata,
                    divisionId,
                    divisionName: division.divisionName
                }
            });
        }
        if (prBracket.divisions.every(d => d.complete)) {
            this._processEndOfSeason(prBracket);
        }
        return { bracket: prBracket, newMatches };
    }
    _processEndOfSeason(bracket) {
        const config = bracket.config;
        const promotionSpots = config.promotionSpots || 2;
        const relegationSpots = config.relegationSpots || 2;
        bracket.promotions = [];
        bracket.relegations = [];
        for (let i = 0; i < bracket.divisions.length; i++) {
            const division = bracket.divisions[i];
            const standings = division.standings;
            const teamCount = standings.length;
            if (i > 0) {
                for (let j = 0; j < promotionSpots && j < standings.length; j++) {
                    bracket.promotions.push({
                        participantId: standings[j].participantId,
                        fromDivision: division.divisionId,
                        toDivision: division.divisionId - 1,
                        type: 'direct'
                    });
                }
            }
            if (i < bracket.divisions.length - 1) {
                for (let j = 0; j < relegationSpots && j < standings.length; j++) {
                    const idx = teamCount - 1 - j;
                    bracket.relegations.push({
                        participantId: standings[idx].participantId,
                        fromDivision: division.divisionId,
                        toDivision: division.divisionId + 1,
                        type: 'direct'
                    });
                }
            }
        }
        bracket.seasonComplete = true;
    }
    getStandings(bracket, matches) {
        const prBracket = bracket;
        const allStandings = [];
        for (const division of prBracket.divisions) {
            const divisionMatches = matches.filter(m => m.metadata?.divisionId === division.divisionId ||
                m.id.startsWith(`D${division.divisionId}_`));
            const leagueFormat = new RoundRobinFormat(division.bracket.config);
            const standings = leagueFormat.getStandings(division.bracket, divisionMatches);
            for (const s of standings) {
                allStandings.push({
                    ...s,
                    divisionId: division.divisionId,
                    divisionName: division.divisionName
                });
            }
        }
        return allStandings;
    }
    isComplete(bracket, _matches) {
        return bracket.seasonComplete;
    }
    getWinner(bracket, matches) {
        const prBracket = bracket;
        if (!this.isComplete(bracket, matches))
            return null;
        const topDivision = prBracket.divisions[0];
        return topDivision.standings[0]?.participantId || null;
    }
    getCurrentPhase(_bracket, _matches) {
        return 'league';
    }
    getCurrentRound(bracket, matches) {
        const prBracket = bracket;
        let minRound = Infinity;
        for (const division of prBracket.divisions) {
            if (!division.complete) {
                const leagueFormat = new RoundRobinFormat(division.bracket.config);
                const divisionMatches = matches.filter(m => m.metadata?.divisionId === division.divisionId ||
                    m.id.startsWith(`D${division.divisionId}_`));
                const round = leagueFormat.getCurrentRound(division.bracket, divisionMatches);
                minRound = Math.min(minRound, round);
            }
        }
        return minRound === Infinity ? 1 : minRound;
    }
    getDivisionStandings(bracket, divisionId) {
        const prBracket = bracket;
        const division = prBracket.divisions.find(d => d.divisionId === divisionId);
        if (!division)
            return null;
        return {
            divisionId,
            divisionName: division.divisionName,
            standings: division.standings,
            promotionZone: this._getPromotionZone(prBracket, divisionId),
            relegationZone: this._getRelegationZone(prBracket, divisionId)
        };
    }
    _getPromotionZone(bracket, divisionId) {
        const division = bracket.divisions.find(d => d.divisionId === divisionId);
        if (!division || divisionId === 1)
            return [];
        const spots = bracket.config.promotionSpots || 2;
        return division.standings.slice(0, spots).map(s => s.participantId);
    }
    _getRelegationZone(bracket, divisionId) {
        const division = bracket.divisions.find(d => d.divisionId === divisionId);
        if (!division || divisionId === bracket.divisions.length)
            return [];
        const spots = bracket.config.relegationSpots || 2;
        return division.standings.slice(-spots).map(s => s.participantId);
    }
    getPromotions(bracket) {
        return bracket.promotions;
    }
    getRelegations(bracket) {
        return bracket.relegations;
    }
    getDivisions(bracket) {
        const prBracket = bracket;
        return prBracket.divisions.map(d => ({
            divisionId: d.divisionId,
            divisionName: d.divisionName,
            participantCount: d.participants.length,
            complete: d.complete
        }));
    }
    newSeason(bracket) {
        const prBracket = bracket;
        if (!prBracket.seasonComplete) {
            throw new Error('Current season not complete');
        }
        for (const promo of prBracket.promotions) {
            this._moveParticipant(prBracket, promo.participantId, promo.fromDivision, promo.toDivision);
        }
        for (const releg of prBracket.relegations) {
            this._moveParticipant(prBracket, releg.participantId, releg.fromDivision, releg.toDivision);
        }
        prBracket.season++;
        prBracket.seasonStartedAt = Date.now();
        prBracket.seasonComplete = false;
        prBracket.promotions = [];
        prBracket.relegations = [];
        for (const division of prBracket.divisions) {
            const leagueFormat = new RoundRobinFormat({
                rounds: prBracket.config.rounds || 2,
                bestOf: prBracket.config.bestOf || 1,
                pointsWin: prBracket.config.pointsWin,
                pointsDraw: prBracket.config.pointsDraw,
                pointsLoss: prBracket.config.pointsLoss
            });
            division.bracket = leagueFormat.generateBracket(division.participants, prBracket.config);
            division.standings = [];
            division.complete = false;
        }
        return prBracket;
    }
    _moveParticipant(bracket, participantId, fromDivisionId, toDivisionId) {
        const fromDivision = bracket.divisions.find(d => d.divisionId === fromDivisionId);
        const toDivision = bracket.divisions.find(d => d.divisionId === toDivisionId);
        if (fromDivision && toDivision) {
            const idx = fromDivision.participants.indexOf(participantId);
            if (idx >= 0) {
                fromDivision.participants.splice(idx, 1);
                toDivision.participants.push(participantId);
            }
        }
    }
}
//# sourceMappingURL=promotion-relegation.js.map