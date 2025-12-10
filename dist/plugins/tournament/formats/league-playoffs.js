import { BaseFormat } from './base-format.js';
import { RoundRobinFormat } from './round-robin.js';
import { SingleEliminationFormat } from './single-elimination.js';
import { DoubleEliminationFormat } from './double-elimination.js';
export class LeaguePlayoffsFormat extends BaseFormat {
    static get type() {
        return 'league-playoffs';
    }
    static get displayName() {
        return 'League + Playoffs (Liga + Mata-Mata)';
    }
    static get defaultConfig() {
        return {
            leagueRounds: 2,
            leagueBestOf: 1,
            pointsWin: 3,
            pointsDraw: 1,
            pointsLoss: 0,
            playoffsFormat: 'single-elimination',
            playoffsSize: 8,
            playoffsBestOf: 3,
            playoffsFinalsBestOf: 5,
            byesForTopSeeds: 0,
            thirdPlaceMatch: false
        };
    }
    validate(participants, config) {
        const errors = [];
        if (!participants || participants.length < 4) {
            errors.push('Minimum 4 participants required');
        }
        const playoffsSize = config.playoffsSize || 8;
        if (playoffsSize > participants.length) {
            errors.push(`Playoffs size (${playoffsSize}) cannot exceed participant count`);
        }
        if (playoffsSize < 2) {
            errors.push('Playoffs must have at least 2 participants');
        }
        return { valid: errors.length === 0, errors };
    }
    generateBracket(participants, config) {
        const leagueFormat = new RoundRobinFormat({
            rounds: config.leagueRounds || 2,
            bestOf: config.leagueBestOf || 1,
            pointsWin: config.pointsWin,
            pointsDraw: config.pointsDraw,
            pointsLoss: config.pointsLoss
        });
        const leagueBracket = leagueFormat.generateBracket(participants, config);
        return {
            type: 'league-playoffs',
            config: { ...this.config, ...config },
            phase: 'league',
            participants: [...participants],
            league: {
                bracket: leagueBracket,
                standings: [],
                complete: false
            },
            playoffs: {
                bracket: null,
                qualifiedParticipants: [],
                complete: false
            }
        };
    }
    getInitialMatches(bracket) {
        const lpBracket = bracket;
        const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config);
        return leagueFormat.getInitialMatches(lpBracket.league.bracket);
    }
    onMatchComplete(bracket, completedMatch) {
        const lpBracket = bracket;
        const newMatches = [];
        if (lpBracket.phase === 'league') {
            return this._processLeagueMatch(lpBracket, completedMatch, newMatches);
        }
        else if (lpBracket.phase === 'playoffs') {
            return this._processPlayoffsMatch(lpBracket, completedMatch, newMatches);
        }
        return { bracket: lpBracket, newMatches };
    }
    _processLeagueMatch(bracket, match, newMatches) {
        const leagueFormat = new RoundRobinFormat(bracket.league.bracket.config);
        const { bracket: updatedLeagueBracket, newMatches: leagueNewMatches } = leagueFormat.onMatchComplete(bracket.league.bracket, match);
        bracket.league.bracket = updatedLeagueBracket;
        const allMatches = bracket.league.bracket.schedule.flatMap(r => r.matches);
        const completedCount = allMatches.filter(m => m.status === 'completed').length;
        if (completedCount >= allMatches.length) {
            bracket.league.complete = true;
            bracket.league.standings = leagueFormat.getStandings(bracket.league.bracket, allMatches);
            bracket.phase = 'playoffs';
            const playoffsMatches = this._initializePlayoffs(bracket);
            newMatches.push(...playoffsMatches);
        }
        else {
            newMatches.push(...leagueNewMatches);
        }
        return { bracket, newMatches };
    }
    _initializePlayoffs(bracket) {
        const config = bracket.config;
        const playoffsSize = config.playoffsSize || 8;
        const qualifiedParticipants = bracket.league.standings
            .slice(0, playoffsSize)
            .map(s => s.participantId);
        bracket.playoffs.qualifiedParticipants = qualifiedParticipants;
        const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
            ? DoubleEliminationFormat
            : SingleEliminationFormat;
        const playoffsConfig = config.playoffsFormat === 'double-elimination'
            ? {
                bestOf: config.playoffsBestOf || 3,
                grandFinalsBestOf: config.playoffsFinalsBestOf || 5
            }
            : {
                bestOf: config.playoffsBestOf || 3,
                finalsBestOf: config.playoffsFinalsBestOf || 5,
                thirdPlaceMatch: config.thirdPlaceMatch
            };
        const playoffsFormat = new PlayoffsFormat(playoffsConfig);
        bracket.playoffs.bracket = playoffsFormat.generateBracket(qualifiedParticipants, playoffsConfig);
        return playoffsFormat.getInitialMatches(bracket.playoffs.bracket).map(m => ({
            ...m,
            phase: 'playoffs'
        }));
    }
    _processPlayoffsMatch(bracket, match, newMatches) {
        const config = bracket.config;
        const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
            ? DoubleEliminationFormat
            : SingleEliminationFormat;
        const playoffsFormat = new PlayoffsFormat(bracket.playoffs.bracket.config);
        const { bracket: updatedPlayoffsBracket, newMatches: playoffsNewMatches } = playoffsFormat.onMatchComplete(bracket.playoffs.bracket, match);
        bracket.playoffs.bracket = updatedPlayoffsBracket;
        const allPlayoffsMatches = this._getAllPlayoffsMatches(bracket.playoffs.bracket);
        if (playoffsFormat.isComplete(bracket.playoffs.bracket, allPlayoffsMatches)) {
            bracket.playoffs.complete = true;
        }
        newMatches.push(...playoffsNewMatches.map(m => ({
            ...m,
            phase: 'playoffs'
        })));
        return { bracket, newMatches };
    }
    _getAllPlayoffsMatches(playoffsBracket) {
        if (playoffsBracket.winnersMatches) {
            return [
                ...playoffsBracket.winnersMatches.flat(),
                ...playoffsBracket.losersMatches.flat(),
                playoffsBracket.grandFinals
            ].filter(Boolean);
        }
        return playoffsBracket.matches.flat();
    }
    getStandings(bracket, matches) {
        const lpBracket = bracket;
        if (lpBracket.phase === 'league' || !lpBracket.playoffs.complete) {
            const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config);
            return leagueFormat.getStandings(lpBracket.league.bracket, matches);
        }
        const standings = [];
        const playoffsMatches = matches.filter(m => m.phase === 'playoffs');
        const config = lpBracket.config;
        const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
            ? DoubleEliminationFormat
            : SingleEliminationFormat;
        const playoffsFormat = new PlayoffsFormat(lpBracket.playoffs.bracket.config);
        const playoffsStandings = playoffsFormat.getStandings(lpBracket.playoffs.bracket, playoffsMatches);
        for (const ps of playoffsStandings) {
            standings.push({
                ...ps,
                qualifiedForPlayoffs: true
            });
        }
        const qualifiedIds = new Set(lpBracket.playoffs.qualifiedParticipants);
        const nonQualified = lpBracket.league.standings.filter(s => !qualifiedIds.has(s.participantId));
        for (const s of nonQualified) {
            standings.push({
                ...s,
                placement: standings.length + 1,
                qualifiedForPlayoffs: false
            });
        }
        return standings;
    }
    isComplete(bracket, _matches) {
        const lpBracket = bracket;
        return lpBracket.league.complete && lpBracket.playoffs.complete;
    }
    getWinner(bracket, matches) {
        const lpBracket = bracket;
        if (!this.isComplete(bracket, matches))
            return null;
        const config = lpBracket.config;
        const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
            ? DoubleEliminationFormat
            : SingleEliminationFormat;
        const playoffsFormat = new PlayoffsFormat(lpBracket.playoffs.bracket.config);
        const playoffsMatches = matches.filter(m => m.phase === 'playoffs');
        return playoffsFormat.getWinner(lpBracket.playoffs.bracket, playoffsMatches);
    }
    getCurrentPhase(bracket, _matches) {
        return bracket.phase;
    }
    getCurrentRound(bracket, matches) {
        const lpBracket = bracket;
        if (lpBracket.phase === 'league') {
            const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config);
            return leagueFormat.getCurrentRound(lpBracket.league.bracket, matches);
        }
        const config = lpBracket.config;
        const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
            ? DoubleEliminationFormat
            : SingleEliminationFormat;
        const playoffsFormat = new PlayoffsFormat(lpBracket.playoffs.bracket.config);
        const playoffsMatches = matches.filter(m => m.phase === 'playoffs');
        return playoffsFormat.getCurrentRound(lpBracket.playoffs.bracket, playoffsMatches);
    }
    getLeagueStandings(bracket, matches) {
        const lpBracket = bracket;
        const leagueFormat = new RoundRobinFormat(lpBracket.league.bracket.config);
        const leagueMatches = matches.filter(m => m.phase === 'league' || !m.phase);
        return leagueFormat.getStandings(lpBracket.league.bracket, leagueMatches);
    }
    getQualifiedParticipants(bracket) {
        return bracket.playoffs.qualifiedParticipants;
    }
}
//# sourceMappingURL=league-playoffs.js.map