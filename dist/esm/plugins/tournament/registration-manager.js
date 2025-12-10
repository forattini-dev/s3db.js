import { idGenerator } from '../../concerns/id.js';
export class RegistrationManager {
    plugin;
    logger;
    constructor(plugin) {
        this.plugin = plugin;
        this.logger = plugin.logger;
    }
    get resource() {
        return this.plugin.registrationsResource;
    }
    async register(tournamentId, participantId, options = {}) {
        const { seed = null, metadata = {} } = options;
        const tournament = await this.plugin.tournamentManager.get(tournamentId);
        if (!tournament)
            throw new Error('Tournament not found');
        if (!['draft', 'registration'].includes(tournament.status)) {
            throw new Error(`Registration is not open. Tournament status: ${tournament.status}`);
        }
        const existing = await this.getRegistration(tournamentId, participantId);
        if (existing) {
            throw new Error('Participant already registered');
        }
        const currentCount = await this.getCount(tournamentId);
        if (tournament.config.maxParticipants && currentCount >= tournament.config.maxParticipants) {
            throw new Error('Tournament is full');
        }
        const registration = await this.resource.insert({
            id: idGenerator(),
            tournamentId,
            participantId,
            seed,
            status: 'pending',
            registeredAt: Date.now(),
            confirmedAt: null,
            checkedInAt: null,
            metadata
        });
        this.plugin.emit('plg:tournament:participant-registered', {
            tournamentId,
            participantId,
            registrationId: registration.id
        });
        this.logger.debug({ tournamentId, participantId }, 'Participant registered');
        return registration;
    }
    async confirm(tournamentId, participantId) {
        const registration = await this.getRegistration(tournamentId, participantId);
        if (!registration)
            throw new Error('Registration not found');
        if (registration.status !== 'pending') {
            throw new Error(`Cannot confirm. Current status: ${registration.status}`);
        }
        await this.resource.update(registration.id, {
            status: 'confirmed',
            confirmedAt: Date.now()
        });
        this.plugin.emit('plg:tournament:participant-confirmed', {
            tournamentId,
            participantId
        });
        this.logger.debug({ tournamentId, participantId }, 'Registration confirmed');
    }
    async checkIn(tournamentId, participantId) {
        const registration = await this.getRegistration(tournamentId, participantId);
        if (!registration)
            throw new Error('Registration not found');
        if (!['pending', 'confirmed'].includes(registration.status)) {
            throw new Error(`Cannot check in. Current status: ${registration.status}`);
        }
        await this.resource.update(registration.id, {
            status: 'checked-in',
            confirmedAt: registration.confirmedAt || Date.now(),
            checkedInAt: Date.now()
        });
        this.plugin.emit('plg:tournament:participant-checked-in', {
            tournamentId,
            participantId
        });
        this.logger.debug({ tournamentId, participantId }, 'Participant checked in');
    }
    async withdraw(tournamentId, participantId, reason = '') {
        const registration = await this.getRegistration(tournamentId, participantId);
        if (!registration)
            throw new Error('Registration not found');
        const tournament = await this.plugin.tournamentManager.get(tournamentId);
        if (tournament && tournament.status === 'in-progress') {
            this.logger.warn({ tournamentId, participantId }, 'Mid-tournament withdrawal');
        }
        await this.resource.update(registration.id, {
            status: 'withdrawn',
            metadata: { ...registration.metadata, withdrawReason: reason, withdrawnAt: Date.now() }
        });
        this.plugin.emit('plg:tournament:participant-withdrawn', {
            tournamentId,
            participantId,
            reason
        });
        this.logger.info({ tournamentId, participantId, reason }, 'Participant withdrawn');
    }
    async getRegistration(tournamentId, participantId) {
        const registrations = await this.resource.listPartition({
            partition: 'byTournament',
            partitionValues: { tournamentId }
        });
        return registrations.find(r => r.participantId === participantId);
    }
    async getByTournament(tournamentId, filters = {}) {
        const { status } = filters;
        let registrations = await this.resource.listPartition({
            partition: 'byTournament',
            partitionValues: { tournamentId }
        });
        if (status) {
            registrations = registrations.filter(r => r.status === status);
        }
        return registrations.sort((a, b) => {
            if (a.seed && b.seed)
                return a.seed - b.seed;
            if (a.seed)
                return -1;
            if (b.seed)
                return 1;
            return a.registeredAt - b.registeredAt;
        });
    }
    async getConfirmed(tournamentId) {
        const registrations = await this.getByTournament(tournamentId);
        return registrations.filter(r => ['confirmed', 'checked-in'].includes(r.status));
    }
    async getCount(tournamentId, status = null) {
        const registrations = await this.getByTournament(tournamentId);
        if (status) {
            return registrations.filter(r => r.status === status).length;
        }
        return registrations.filter(r => r.status !== 'withdrawn').length;
    }
    async deleteByTournament(tournamentId) {
        const registrations = await this.getByTournament(tournamentId);
        for (const reg of registrations) {
            await this.resource.delete(reg.id);
        }
        return registrations.length;
    }
    async setSeed(tournamentId, participantId, seed) {
        const registration = await this.getRegistration(tournamentId, participantId);
        if (!registration)
            throw new Error('Registration not found');
        const tournament = await this.plugin.tournamentManager.get(tournamentId);
        if (tournament && tournament.status === 'in-progress') {
            throw new Error('Cannot change seed during tournament');
        }
        await this.resource.update(registration.id, { seed });
        this.logger.debug({ tournamentId, participantId, seed }, 'Seed updated');
    }
    async shuffleSeeds(tournamentId) {
        const tournament = await this.plugin.tournamentManager.get(tournamentId);
        if (tournament && tournament.status === 'in-progress') {
            throw new Error('Cannot shuffle seeds during tournament');
        }
        const registrations = await this.getConfirmed(tournamentId);
        const shuffled = [...registrations];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        for (let i = 0; i < shuffled.length; i++) {
            await this.resource.update(shuffled[i].id, { seed: i + 1 });
        }
        this.logger.info({ tournamentId, count: shuffled.length }, 'Seeds shuffled');
        return shuffled.map((r, i) => ({ participantId: r.participantId, seed: i + 1 }));
    }
    async getByParticipant(participantId, filters = {}) {
        const { status } = filters;
        let registrations = await this.resource.listPartition({
            partition: 'byParticipant',
            partitionValues: { participantId }
        });
        if (status) {
            registrations = registrations.filter(r => r.status === status);
        }
        return registrations;
    }
    async bulkRegister(tournamentId, participants) {
        const results = [];
        for (const p of participants) {
            try {
                const participantData = typeof p === 'string' ? { participantId: p } : p;
                const reg = await this.register(tournamentId, participantData.participantId || p, { seed: participantData.seed, metadata: participantData.metadata });
                results.push({ success: true, registration: reg });
            }
            catch (error) {
                const participantId = typeof p === 'string' ? p : (p.participantId || '');
                results.push({ success: false, participantId, error: error.message });
            }
        }
        return results;
    }
    async confirmAll(tournamentId) {
        const pending = await this.getByTournament(tournamentId, { status: 'pending' });
        for (const reg of pending) {
            await this.resource.update(reg.id, {
                status: 'confirmed',
                confirmedAt: Date.now()
            });
        }
        this.logger.info({ tournamentId, count: pending.length }, 'All registrations confirmed');
        return pending.length;
    }
}
//# sourceMappingURL=registration-manager.js.map