import { Plugin } from './plugin.class.js';
import { TournamentManager } from './tournament/tournament-manager.js';
import { MatchManager } from './tournament/match-manager.js';
import { RegistrationManager } from './tournament/registration-manager.js';
import { getAvailableFormats, getFormatMetadata } from './tournament/formats/index.js';
export class TournamentPlugin extends Plugin {
    config;
    _tournamentsDescriptor;
    _matchesDescriptor;
    _registrationsDescriptor;
    tournamentsResource = null;
    matchesResource = null;
    registrationsResource = null;
    tournamentManager = null;
    matchManager = null;
    registrationManager = null;
    stats;
    constructor(options = {}) {
        super(options);
        const resourceNames = this.options.resourceNames || {};
        this.config = {
            logLevel: this.options.logLevel
        };
        this._tournamentsDescriptor = {
            defaultName: 'plg_tournaments',
            override: resourceNames.tournaments
        };
        this._matchesDescriptor = {
            defaultName: 'plg_tournament_matches',
            override: resourceNames.matches
        };
        this._registrationsDescriptor = {
            defaultName: 'plg_tournament_registrations',
            override: resourceNames.registrations
        };
        this.tournamentsResource = null;
        this.matchesResource = null;
        this.registrationsResource = null;
        this.tournamentManager = null;
        this.matchManager = null;
        this.registrationManager = null;
        this.stats = {
            tournamentsCreated: 0,
            matchesPlayed: 0,
            registrations: 0,
            errors: 0
        };
    }
    async onInstall() {
        await this._createResources();
        this._initializeManagers();
        this.logger.debug({ formats: getAvailableFormats() }, 'TournamentPlugin installed');
        this.emit('plg:tournament:installed', {
            formats: getAvailableFormats(),
            timestamp: Date.now()
        });
    }
    async _createResources() {
        this.tournamentsResource = await this.database.createResource({
            name: this._resolveTournamentsName(),
            attributes: {
                name: 'string|required',
                organizerId: 'string|required',
                format: 'string|required',
                participantType: 'string|required',
                participantResource: 'string|optional',
                status: 'string|required',
                config: 'object|optional',
                participants: 'array|items:string|optional',
                bracket: 'object|optional',
                standings: 'array|optional',
                currentPhase: 'string|optional',
                currentRound: 'number|optional|default:0',
                metadata: 'object|optional',
                startedAt: 'number|optional',
                completedAt: 'number|optional'
            },
            partitions: {
                byOrganizer: { fields: { organizerId: 'string' } },
                byStatus: { fields: { status: 'string' } },
                byFormat: { fields: { format: 'string' } }
            },
            timestamps: true,
            behavior: 'body-overflow'
        });
        this.matchesResource = await this.database.createResource({
            name: this._resolveMatchesName(),
            attributes: {
                tournamentId: 'string|required',
                phase: 'string|required',
                round: 'number|required',
                matchNumber: 'number|required',
                groupId: 'string|optional',
                participant1Id: 'string|optional',
                participant2Id: 'string|optional',
                bestOf: 'number|optional|default:1',
                games: 'array|optional',
                score1: 'number|optional|default:0',
                score2: 'number|optional|default:0',
                winnerId: 'string|optional',
                loserId: 'string|optional',
                status: 'string|required',
                nextMatchId: 'string|optional',
                loserNextMatchId: 'string|optional',
                scheduledAt: 'number|optional',
                startedAt: 'number|optional',
                completedAt: 'number|optional',
                metadata: 'object|optional'
            },
            partitions: {
                byTournament: { fields: { tournamentId: 'string' } },
                byStatus: { fields: { status: 'string' } },
                byPhase: { fields: { phase: 'string' } }
            },
            asyncPartitions: false,
            timestamps: true,
            behavior: 'body-overflow'
        });
        this.registrationsResource = await this.database.createResource({
            name: this._resolveRegistrationsName(),
            attributes: {
                tournamentId: 'string|required',
                participantId: 'string|required',
                seed: 'number|optional',
                status: 'string|required',
                registeredAt: 'number|optional',
                confirmedAt: 'number|optional',
                checkedInAt: 'number|optional',
                metadata: 'object|optional'
            },
            partitions: {
                byTournament: { fields: { tournamentId: 'string' } },
                byParticipant: { fields: { participantId: 'string' } },
                byStatus: { fields: { status: 'string' } }
            },
            asyncPartitions: false,
            timestamps: true
        });
    }
    _initializeManagers() {
        this.tournamentManager = new TournamentManager(this);
        this.matchManager = new MatchManager(this);
        this.registrationManager = new RegistrationManager(this);
    }
    _resolveTournamentsName() {
        const base = this._tournamentsDescriptor.override || this._tournamentsDescriptor.defaultName;
        return this.namespace ? `${base}--${this.namespace}` : base;
    }
    _resolveMatchesName() {
        const base = this._matchesDescriptor.override || this._matchesDescriptor.defaultName;
        return this.namespace ? `${base}--${this.namespace}` : base;
    }
    _resolveRegistrationsName() {
        const base = this._registrationsDescriptor.override || this._registrationsDescriptor.defaultName;
        return this.namespace ? `${base}--${this.namespace}` : base;
    }
    onNamespaceChanged() {
        // Re-resolve resource names if namespace changes
    }
    async create(options) {
        const result = await this.tournamentManager.create(options);
        this.stats.tournamentsCreated++;
        return result;
    }
    async get(tournamentId) {
        return this.tournamentManager.get(tournamentId);
    }
    async update(tournamentId, data) {
        return this.tournamentManager.update(tournamentId, data);
    }
    async delete(tournamentId) {
        return this.tournamentManager.delete(tournamentId);
    }
    async list(filters = {}) {
        return this.tournamentManager.list(filters);
    }
    async openRegistration(tournamentId) {
        return this.tournamentManager.openRegistration(tournamentId);
    }
    async closeRegistration(tournamentId) {
        return this.tournamentManager.closeRegistration(tournamentId);
    }
    async startTournament(tournamentId) {
        return this.tournamentManager.start(tournamentId);
    }
    async cancel(tournamentId, reason = '') {
        return this.tournamentManager.cancel(tournamentId, reason);
    }
    async complete(tournamentId) {
        return this.tournamentManager.complete(tournamentId);
    }
    async register(tournamentId, participantId, options = {}) {
        const result = await this.registrationManager.register(tournamentId, participantId, options);
        this.stats.registrations++;
        return result;
    }
    async confirmRegistration(tournamentId, participantId) {
        return this.registrationManager.confirm(tournamentId, participantId);
    }
    async checkIn(tournamentId, participantId) {
        return this.registrationManager.checkIn(tournamentId, participantId);
    }
    async withdraw(tournamentId, participantId, reason = '') {
        return this.registrationManager.withdraw(tournamentId, participantId, reason);
    }
    async getParticipants(tournamentId) {
        return this.registrationManager.getByTournament(tournamentId);
    }
    async setSeed(tournamentId, participantId, seed) {
        return this.registrationManager.setSeed(tournamentId, participantId, seed);
    }
    async shuffleSeeds(tournamentId) {
        return this.registrationManager.shuffleSeeds(tournamentId);
    }
    async getMatches(tournamentId, filters = {}) {
        return this.matchManager.getByTournament(tournamentId, filters);
    }
    async getMatch(matchId) {
        return this.matchManager.get(matchId);
    }
    async scheduleMatch(matchId, scheduledAt) {
        return this.matchManager.schedule(matchId, scheduledAt);
    }
    async startMatch(matchId) {
        return this.matchManager.start(matchId);
    }
    async reportResult(matchId, result) {
        const match = await this.matchManager.reportResult(matchId, result);
        this.stats.matchesPlayed++;
        return match;
    }
    async reportWalkover(matchId, winnerId, reason = '') {
        const match = await this.matchManager.reportWalkover(matchId, winnerId, reason);
        this.stats.matchesPlayed++;
        return match;
    }
    async reportGame(matchId, game) {
        return this.matchManager.reportGame(matchId, game);
    }
    async getUpcomingMatches(tournamentId, limit = 10) {
        return this.matchManager.getUpcoming(tournamentId, limit);
    }
    async getLiveMatches(tournamentId) {
        return this.matchManager.getLive(tournamentId);
    }
    async getStandings(tournamentId) {
        return this.tournamentManager.getStandings(tournamentId);
    }
    async getBracket(tournamentId) {
        return this.tournamentManager.getBracket(tournamentId);
    }
    async challenge(tournamentId, challengerId, defenderId) {
        const tournament = await this.get(tournamentId);
        if (!tournament || tournament.format !== 'ladder') {
            throw new Error('Challenge is only available for ladder format');
        }
        const { LadderFormat } = await import('./tournament/formats/ladder.js');
        const format = new LadderFormat(tournament.config || {});
        const result = format.createChallenge(tournament.bracket, challengerId, defenderId);
        if (!result.valid) {
            throw new Error(result.error);
        }
        const match = await this.matchManager.create({
            tournamentId,
            ...result.match
        });
        await this.tournamentManager.update(tournamentId, { bracket: tournament.bracket });
        return match;
    }
    async getLadderRanking(tournamentId) {
        const tournament = await this.get(tournamentId);
        if (!tournament || tournament.format !== 'ladder') {
            throw new Error('Only available for ladder format');
        }
        const { LadderFormat } = await import('./tournament/formats/ladder.js');
        const format = new LadderFormat(tournament.config || {});
        return format.getRankings(tournament.bracket);
    }
    async addCircuitEvent(circuitId, event) {
        const circuit = await this.get(circuitId);
        if (!circuit || circuit.format !== 'circuit') {
            throw new Error('Only available for circuit format');
        }
        const { CircuitFormat } = await import('./tournament/formats/circuit.js');
        const format = new CircuitFormat(circuit.config || {});
        const updatedBracket = format.addEvent(circuit.bracket, event);
        await this.tournamentManager.update(circuitId, {
            bracket: updatedBracket,
            standings: format.getStandings(updatedBracket, [])
        });
        this.emit('plg:tournament:circuit-event-added', {
            circuitId,
            eventId: event.id
        });
        return updatedBracket;
    }
    async getCircuitStandings(circuitId) {
        const circuit = await this.get(circuitId);
        if (!circuit || circuit.format !== 'circuit') {
            throw new Error('Only available for circuit format');
        }
        const { CircuitFormat } = await import('./tournament/formats/circuit.js');
        const format = new CircuitFormat(circuit.config || {});
        return format.getStandings(circuit.bracket, []);
    }
    async getDivisions(tournamentId) {
        const tournament = await this.get(tournamentId);
        if (!tournament || tournament.format !== 'promotion-relegation') {
            throw new Error('Only available for promotion-relegation format');
        }
        const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
        const format = new PromotionRelegationFormat(tournament.config || {});
        return format.getDivisions(tournament.bracket);
    }
    async getPromotionZone(tournamentId, divisionId) {
        const tournament = await this.get(tournamentId);
        if (!tournament || tournament.format !== 'promotion-relegation') {
            throw new Error('Only available for promotion-relegation format');
        }
        const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
        const format = new PromotionRelegationFormat(tournament.config || {});
        return format._getPromotionZone(tournament.bracket, divisionId);
    }
    async getRelegationZone(tournamentId, divisionId) {
        const tournament = await this.get(tournamentId);
        if (!tournament || tournament.format !== 'promotion-relegation') {
            throw new Error('Only available for promotion-relegation format');
        }
        const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
        const format = new PromotionRelegationFormat(tournament.config || {});
        return format._getRelegationZone(tournament.bracket, divisionId);
    }
    getAvailableFormats() {
        return getAvailableFormats();
    }
    getFormatMetadata() {
        return getFormatMetadata();
    }
    getStats() {
        return { ...this.stats };
    }
    async onStop() {
        this.logger.debug('TournamentPlugin stopped');
    }
}
//# sourceMappingURL=tournament.plugin.js.map