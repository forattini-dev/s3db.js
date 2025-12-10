import { idGenerator } from '../../concerns/id.js';
export class MatchManager {
    plugin;
    logger;
    constructor(plugin) {
        this.plugin = plugin;
        this.logger = plugin.logger;
    }
    get resource() {
        return this.plugin.matchesResource;
    }
    async create(data) {
        const { tournamentId, phase = 'main', round, matchNumber, participant1Id = null, participant2Id = null, bestOf = 1, groupId = null, nextMatchId = null, loserNextMatchId = null, scheduledAt = null, metadata = {} } = data;
        if (!tournamentId)
            throw new Error('Tournament ID is required');
        const matchRefId = data.id || idGenerator();
        const matchId = `${tournamentId}:${matchRefId}`;
        const match = await this.resource.insert({
            id: matchId,
            tournamentId,
            phase,
            round,
            matchNumber,
            participant1Id,
            participant2Id,
            bestOf,
            games: [],
            score1: 0,
            score2: 0,
            winnerId: null,
            loserId: null,
            status: this._determineInitialStatus(participant1Id, participant2Id),
            groupId,
            nextMatchId,
            loserNextMatchId,
            scheduledAt,
            startedAt: null,
            completedAt: null,
            metadata: matchRefId
                ? { ...metadata, matchRef: matchRefId }
                : { ...metadata }
        });
        this.plugin.emit('plg:tournament:match-created', { match });
        return match;
    }
    _determineInitialStatus(p1, p2) {
        if (p1 && p2)
            return 'pending';
        if (p1 || p2)
            return 'waiting';
        return 'empty';
    }
    async get(id) {
        return this.resource.get(id);
    }
    async getByTournament(tournamentId, filters = {}) {
        const { phase, round, status, limit = 1000 } = filters;
        let matches = await this.resource.listPartition({
            partition: 'byTournament',
            partitionValues: { tournamentId },
            limit
        });
        if (phase)
            matches = matches.filter(m => m.phase === phase);
        if (round)
            matches = matches.filter(m => m.round === round);
        if (status)
            matches = matches.filter(m => m.status === status);
        return matches.sort((a, b) => {
            if (a.round !== b.round)
                return a.round - b.round;
            return a.matchNumber - b.matchNumber;
        });
    }
    async deleteByTournament(tournamentId) {
        const matches = await this.getByTournament(tournamentId);
        for (const match of matches) {
            await this.resource.delete(match.id);
        }
        return matches.length;
    }
    async schedule(matchId, scheduledAt) {
        const match = await this.resource.get(matchId);
        if (!match)
            throw new Error('Match not found');
        if (match.status === 'completed') {
            throw new Error('Cannot schedule completed match');
        }
        await this.resource.update(matchId, {
            scheduledAt,
            status: 'scheduled'
        });
        this.plugin.emit('plg:tournament:match-scheduled', {
            matchId,
            tournamentId: match.tournamentId,
            scheduledAt
        });
        this.logger.debug({ matchId, scheduledAt }, 'Match scheduled');
    }
    async start(matchId) {
        const match = await this.resource.get(matchId);
        if (!match)
            throw new Error('Match not found');
        if (!match.participant1Id || !match.participant2Id) {
            throw new Error('Cannot start match without both participants');
        }
        if (!['pending', 'scheduled'].includes(match.status)) {
            throw new Error(`Cannot start match. Current status: ${match.status}`);
        }
        await this.resource.update(matchId, {
            status: 'in-progress',
            startedAt: Date.now()
        });
        this.plugin.emit('plg:tournament:match-started', {
            matchId,
            tournamentId: match.tournamentId,
            participant1Id: match.participant1Id,
            participant2Id: match.participant2Id
        });
        this.logger.debug({ matchId }, 'Match started');
    }
    async reportResult(matchId, result) {
        const { score1, score2, games = [], metadata = {} } = result;
        const match = await this.resource.get(matchId);
        if (!match)
            throw new Error('Match not found');
        if (!['pending', 'scheduled', 'in-progress'].includes(match.status)) {
            throw new Error(`Cannot report result. Current status: ${match.status}`);
        }
        if (typeof score1 !== 'number' || typeof score2 !== 'number') {
            throw new Error('Scores must be numbers');
        }
        const winsNeeded = Math.ceil(match.bestOf / 2);
        let winnerId = null;
        let loserId = null;
        if (score1 >= winsNeeded) {
            winnerId = match.participant1Id;
            loserId = match.participant2Id;
        }
        else if (score2 >= winsNeeded) {
            winnerId = match.participant2Id;
            loserId = match.participant1Id;
        }
        else if (match.bestOf === 1) {
            if (score1 > score2) {
                winnerId = match.participant1Id;
                loserId = match.participant2Id;
            }
            else if (score2 > score1) {
                winnerId = match.participant2Id;
                loserId = match.participant1Id;
            }
        }
        const existingMetadata = (match.metadata || {});
        const updatedMatch = await this.resource.update(matchId, {
            score1,
            score2,
            games: games.length > 0 ? games : match.games,
            winnerId,
            loserId,
            status: 'completed',
            completedAt: Date.now(),
            metadata: { ...existingMetadata, ...metadata }
        });
        this.plugin.emit('plg:tournament:match-completed', {
            matchId,
            tournamentId: match.tournamentId,
            winnerId,
            loserId,
            score1,
            score2
        });
        this.logger.info({
            matchId,
            tournamentId: match.tournamentId,
            winnerId,
            score: `${score1}-${score2}`
        }, 'Match completed');
        await this.plugin.tournamentManager.updateBracket(match.tournamentId, updatedMatch);
        if (winnerId && match.nextMatchId) {
            await this._advanceToMatch(match.nextMatchId, winnerId, 'winner', match.tournamentId);
        }
        if (loserId && match.loserNextMatchId) {
            await this._advanceToMatch(match.loserNextMatchId, loserId, 'loser', match.tournamentId);
        }
        return updatedMatch;
    }
    async reportWalkover(matchId, winnerId, reason = '') {
        const match = await this.resource.get(matchId);
        if (!match)
            throw new Error('Match not found');
        if (winnerId !== match.participant1Id && winnerId !== match.participant2Id) {
            throw new Error('Winner must be one of the match participants');
        }
        const loserId = winnerId === match.participant1Id
            ? match.participant2Id
            : match.participant1Id;
        const existingMetadata = (match.metadata || {});
        const updatedMatch = await this.resource.update(matchId, {
            winnerId,
            loserId,
            status: 'walkover',
            completedAt: Date.now(),
            metadata: { ...existingMetadata, walkoverReason: reason }
        });
        this.plugin.emit('plg:tournament:match-walkover', {
            matchId,
            tournamentId: match.tournamentId,
            winnerId,
            loserId,
            reason
        });
        this.logger.info({ matchId, winnerId, reason }, 'Walkover reported');
        await this.plugin.tournamentManager.updateBracket(match.tournamentId, updatedMatch);
        if (match.nextMatchId) {
            await this._advanceToMatch(match.nextMatchId, winnerId, 'winner', match.tournamentId);
        }
        if (loserId && match.loserNextMatchId) {
            await this._advanceToMatch(match.loserNextMatchId, loserId, 'loser', match.tournamentId);
        }
        return updatedMatch;
    }
    async reportGame(matchId, game) {
        const { score1, score2, metadata = {} } = game;
        const match = await this.resource.get(matchId);
        if (!match)
            throw new Error('Match not found');
        if (!['pending', 'scheduled', 'in-progress'].includes(match.status)) {
            throw new Error(`Cannot report game. Match status: ${match.status}`);
        }
        const existingGames = (match.games || []);
        const gameNumber = existingGames.length + 1;
        const newGame = {
            gameNumber,
            score1,
            score2,
            winner: score1 > score2 ? match.participant1Id : (score2 > score1 ? match.participant2Id : null),
            reportedAt: Date.now(),
            metadata
        };
        const updatedGames = [...existingGames, newGame];
        const p1Wins = updatedGames.filter(g => g.winner === match.participant1Id).length;
        const p2Wins = updatedGames.filter(g => g.winner === match.participant2Id).length;
        const winsNeeded = Math.ceil(match.bestOf / 2);
        const seriesComplete = p1Wins >= winsNeeded || p2Wins >= winsNeeded;
        if (seriesComplete) {
            return this.reportResult(matchId, {
                score1: p1Wins,
                score2: p2Wins,
                games: updatedGames
            });
        }
        await this.resource.update(matchId, {
            games: updatedGames,
            score1: p1Wins,
            score2: p2Wins,
            status: 'in-progress'
        });
        this.plugin.emit('plg:tournament:game-reported', {
            matchId,
            tournamentId: match.tournamentId,
            gameNumber,
            currentScore: `${p1Wins}-${p2Wins}`
        });
        const result = await this.resource.get(matchId);
        return result;
    }
    async getUpcoming(tournamentId, limit = 10) {
        const matches = await this.getByTournament(tournamentId, { status: 'scheduled' });
        return matches
            .filter(m => m.scheduledAt && m.scheduledAt > Date.now())
            .sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0))
            .slice(0, limit);
    }
    async getLive(tournamentId) {
        return this.getByTournament(tournamentId, { status: 'in-progress' });
    }
    async _advanceToMatch(matchId, participantId, _slot, tournamentId = null) {
        const targetMatchId = tournamentId ? `${tournamentId}:${matchId}` : matchId;
        let match;
        try {
            match = await this.resource.get(targetMatchId);
        }
        catch (err) {
            const error = err;
            if (error.code === 'NoSuchKey' || error.name === 'NoSuchKey') {
                this.logger.warn({ matchId: targetMatchId, participantId }, 'Next match not found for advancement');
                return;
            }
            throw err;
        }
        if (!match) {
            this.logger.warn({ matchId: targetMatchId, participantId }, 'Next match not found for advancement');
            return;
        }
        const update = {};
        if (!match.participant1Id) {
            update.participant1Id = participantId;
        }
        else if (!match.participant2Id) {
            update.participant2Id = participantId;
        }
        else {
            this.logger.warn({ matchId }, 'Both slots already filled');
            return;
        }
        if (update.participant1Id && match.participant2Id) {
            update.status = 'pending';
        }
        else if (update.participant2Id && match.participant1Id) {
            update.status = 'pending';
        }
        await this.resource.update(matchId, update);
        this.logger.debug({ matchId, participantId, slot: _slot }, 'Participant advanced');
    }
    async setParticipant(matchId, participantId, slot) {
        const match = await this.resource.get(matchId);
        if (!match)
            throw new Error('Match not found');
        if (slot !== 1 && slot !== 2) {
            throw new Error('Slot must be 1 or 2');
        }
        const update = slot === 1
            ? { participant1Id: participantId }
            : { participant2Id: participantId };
        const otherParticipant = slot === 1 ? match.participant2Id : match.participant1Id;
        if (otherParticipant && participantId) {
            update.status = 'pending';
        }
        await this.resource.update(matchId, update);
    }
}
//# sourceMappingURL=match-manager.js.map