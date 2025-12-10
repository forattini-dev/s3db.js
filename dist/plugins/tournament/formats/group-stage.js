import { BaseFormat } from './base-format.js';
import { generateRoundRobinSchedule, generateGSLBracket } from '../bracket-generator.js';
import { calculateRoundRobinStandings } from '../standings-calculator.js';
import { snakeSeeding } from '../seeding-strategies.js';
export class GroupStageFormat extends BaseFormat {
    static get type() {
        return 'group-stage';
    }
    static get displayName() {
        return 'Group Stage (Fase de Grupos)';
    }
    static get defaultConfig() {
        return {
            groupCount: 4,
            participantsPerGroup: 4,
            style: 'round-robin',
            rounds: 1,
            bestOf: 1,
            advanceCount: 2,
            pointsWin: 3,
            pointsDraw: 1,
            pointsLoss: 0,
            seedingStrategy: 'snake'
        };
    }
    validate(participants, config) {
        const errors = [];
        if (!participants || participants.length < 4) {
            errors.push('Minimum 4 participants required for group stage');
        }
        const groupCount = config.groupCount || 4;
        const perGroup = config.participantsPerGroup || 4;
        if (participants.length < groupCount * 2) {
            errors.push(`Not enough participants for ${groupCount} groups`);
        }
        if (config.style === 'gsl' && perGroup !== 4) {
            errors.push('GSL format requires exactly 4 participants per group');
        }
        if (config.advanceCount && config.advanceCount >= perGroup) {
            errors.push('Advance count must be less than participants per group');
        }
        return { valid: errors.length === 0, errors };
    }
    generateBracket(participants, config) {
        const gsConfig = config;
        const groupCount = gsConfig.groupCount || 4;
        const perGroup = gsConfig.participantsPerGroup || Math.ceil(participants.length / groupCount);
        let groups;
        if (gsConfig.seedingStrategy === 'snake') {
            groups = snakeSeeding(participants, groupCount);
        }
        else if (gsConfig.seedingStrategy === 'random') {
            const shuffled = [...participants].sort(() => Math.random() - 0.5);
            groups = this._distributeSequential(shuffled, groupCount);
        }
        else {
            groups = this._distributeSequential(participants, groupCount);
        }
        const groupBrackets = groups.map((groupParticipants, index) => {
            const groupId = String.fromCharCode(65 + index);
            if (gsConfig.style === 'gsl') {
                return {
                    groupId,
                    style: 'gsl',
                    participants: groupParticipants,
                    bracket: generateGSLBracket({ participants: groupParticipants, bestOf: gsConfig.bestOf }),
                    advancing: [],
                    eliminated: [],
                    complete: false
                };
            }
            else {
                return {
                    groupId,
                    style: 'round-robin',
                    participants: groupParticipants,
                    schedule: generateRoundRobinSchedule(groupParticipants, {
                        rounds: gsConfig.rounds || 1,
                        bestOf: gsConfig.bestOf
                    }),
                    standings: [],
                    complete: false
                };
            }
        });
        return {
            type: 'group-stage',
            style: gsConfig.style || 'round-robin',
            config: { ...this.config, ...gsConfig },
            groups: groupBrackets,
            advanceCount: gsConfig.advanceCount || 2,
            advancing: [],
            currentGroup: 0
        };
    }
    _distributeSequential(participants, groupCount) {
        const groups = Array.from({ length: groupCount }, () => []);
        for (let i = 0; i < participants.length; i++) {
            groups[i % groupCount].push(participants[i]);
        }
        return groups;
    }
    getInitialMatches(bracket) {
        const groupBracket = bracket;
        const matches = [];
        for (const group of groupBracket.groups) {
            if (group.style === 'gsl') {
                const gslMatches = group.bracket.matches;
                const openingMatches = gslMatches.filter(m => m.type === 'opening');
                for (const match of openingMatches) {
                    matches.push({
                        ...this.createMatchTemplate({
                            phase: 'groups',
                            round: 1,
                            matchNumber: matches.length + 1,
                            participant1Id: match.participant1Id,
                            participant2Id: match.participant2Id,
                            bestOf: match.bestOf,
                            groupId: group.groupId
                        }),
                        id: `G${group.groupId}_${match.id}`
                    });
                }
            }
            else {
                if (group.schedule && group.schedule.matches.length > 0) {
                    for (const match of group.schedule.matches[0]) {
                        matches.push({
                            ...this.createMatchTemplate({
                                phase: 'groups',
                                round: match.round,
                                matchNumber: match.matchNumber,
                                participant1Id: match.participant1Id,
                                participant2Id: match.participant2Id,
                                bestOf: match.bestOf,
                                groupId: group.groupId
                            }),
                            id: `G${group.groupId}_${match.id}`
                        });
                    }
                }
            }
        }
        return matches;
    }
    onMatchComplete(bracket, completedMatch) {
        const groupBracket = bracket;
        const newMatches = [];
        const groupId = completedMatch.groupId;
        const group = groupBracket.groups.find(g => g.groupId === groupId);
        if (!group)
            return { bracket: groupBracket, newMatches };
        if (group.style === 'gsl') {
            this._processGSLMatch(groupBracket, group, completedMatch, newMatches);
        }
        else {
            this._processRoundRobinMatch(groupBracket, group, completedMatch, newMatches);
        }
        if (groupBracket.groups.every(g => g.complete)) {
            groupBracket.advancing = groupBracket.groups.flatMap(g => (g.advancing || []).map(a => ({ ...a, groupId: g.groupId })));
        }
        return { bracket: groupBracket, newMatches };
    }
    _processGSLMatch(bracket, group, match, newMatches) {
        const gslMatches = group.bracket.matches;
        const gslMatch = gslMatches.find(m => `G${group.groupId}_${m.id}` === match.id || m.id === match.id.replace(`G${group.groupId}_`, ''));
        if (!gslMatch)
            return;
        gslMatch.winnerId = match.winnerId;
        gslMatch.loserId = match.loserId;
        gslMatch.status = 'completed';
        if (gslMatch.type === 'opening') {
            const winnersMatch = gslMatches.find(m => m.id === 'WM');
            const losersMatch = gslMatches.find(m => m.id === 'LM');
            if (gslMatch.winnerNextMatch === 'WM') {
                if (!winnersMatch.participant1Id) {
                    winnersMatch.participant1Id = match.winnerId;
                }
                else {
                    winnersMatch.participant2Id = match.winnerId;
                }
            }
            if (gslMatch.loserNextMatch === 'LM') {
                if (!losersMatch.participant1Id) {
                    losersMatch.participant1Id = match.loserId;
                }
                else {
                    losersMatch.participant2Id = match.loserId;
                }
            }
            if (winnersMatch.participant1Id && winnersMatch.participant2Id && winnersMatch.status === 'pending') {
                newMatches.push({
                    ...this.createMatchTemplate({
                        phase: 'groups',
                        round: 2,
                        matchNumber: 1,
                        participant1Id: winnersMatch.participant1Id,
                        participant2Id: winnersMatch.participant2Id,
                        bestOf: winnersMatch.bestOf,
                        groupId: group.groupId
                    }),
                    id: `G${group.groupId}_WM`
                });
            }
            if (losersMatch.participant1Id && losersMatch.participant2Id && losersMatch.status === 'pending') {
                newMatches.push({
                    ...this.createMatchTemplate({
                        phase: 'groups',
                        round: 2,
                        matchNumber: 2,
                        participant1Id: losersMatch.participant1Id,
                        participant2Id: losersMatch.participant2Id,
                        bestOf: losersMatch.bestOf,
                        groupId: group.groupId
                    }),
                    id: `G${group.groupId}_LM`
                });
            }
        }
        else if (gslMatch.type === 'winners') {
            group.advancing = group.advancing || [];
            group.advancing.push({ participantId: match.winnerId, seed: 1 });
            const deciderMatch = gslMatches.find(m => m.id === 'DM');
            deciderMatch.participant1Id = match.loserId;
            if (deciderMatch.participant1Id && deciderMatch.participant2Id && deciderMatch.status === 'pending') {
                newMatches.push({
                    ...this.createMatchTemplate({
                        phase: 'groups',
                        round: 3,
                        matchNumber: 1,
                        participant1Id: deciderMatch.participant1Id,
                        participant2Id: deciderMatch.participant2Id,
                        bestOf: deciderMatch.bestOf,
                        groupId: group.groupId
                    }),
                    id: `G${group.groupId}_DM`
                });
            }
        }
        else if (gslMatch.type === 'losers') {
            group.eliminated = group.eliminated || [];
            group.eliminated.push(match.loserId);
            const deciderMatch = gslMatches.find(m => m.id === 'DM');
            deciderMatch.participant2Id = match.winnerId;
            if (deciderMatch.participant1Id && deciderMatch.participant2Id && deciderMatch.status === 'pending') {
                newMatches.push({
                    ...this.createMatchTemplate({
                        phase: 'groups',
                        round: 3,
                        matchNumber: 1,
                        participant1Id: deciderMatch.participant1Id,
                        participant2Id: deciderMatch.participant2Id,
                        bestOf: deciderMatch.bestOf,
                        groupId: group.groupId
                    }),
                    id: `G${group.groupId}_DM`
                });
            }
        }
        else if (gslMatch.type === 'decider') {
            group.advancing = group.advancing || [];
            group.advancing.push({ participantId: match.winnerId, seed: 2 });
            group.eliminated = group.eliminated || [];
            group.eliminated.push(match.loserId);
            group.complete = true;
        }
    }
    _processRoundRobinMatch(bracket, group, match, newMatches) {
        const allMatches = group.schedule.matches.flat();
        const matchIndex = allMatches.findIndex(m => `G${group.groupId}_${m.id}` === match.id);
        if (matchIndex >= 0) {
            allMatches[matchIndex].status = 'completed';
            allMatches[matchIndex].winnerId = match.winnerId;
        }
        let currentRoundIndex = 0;
        for (let i = 0; i < group.schedule.matches.length; i++) {
            const roundComplete = group.schedule.matches[i].every(m => m.status === 'completed');
            if (roundComplete) {
                currentRoundIndex = i + 1;
            }
            else {
                break;
            }
        }
        if (currentRoundIndex < group.schedule.matches.length) {
            const nextRound = group.schedule.matches[currentRoundIndex];
            const pendingInNextRound = nextRound.filter(m => m.status !== 'completed');
            for (const nextMatch of pendingInNextRound) {
                if (!newMatches.some(nm => nm.id === `G${group.groupId}_${nextMatch.id}`)) {
                    newMatches.push({
                        ...this.createMatchTemplate({
                            phase: 'groups',
                            round: nextMatch.round,
                            matchNumber: nextMatch.matchNumber,
                            participant1Id: nextMatch.participant1Id,
                            participant2Id: nextMatch.participant2Id,
                            bestOf: nextMatch.bestOf,
                            groupId: group.groupId
                        }),
                        id: `G${group.groupId}_${nextMatch.id}`
                    });
                }
            }
        }
        const allComplete = allMatches.every(m => m.status === 'completed');
        if (allComplete) {
            group.complete = true;
            const standings = calculateRoundRobinStandings(allMatches, bracket.config);
            group.standings = standings;
            group.advancing = standings.slice(0, bracket.advanceCount).map((s, i) => ({
                participantId: s.participantId,
                seed: i + 1
            }));
            group.eliminated = standings.slice(bracket.advanceCount).map(s => s.participantId);
        }
    }
    getStandings(bracket, matches) {
        const groupBracket = bracket;
        const allStandings = [];
        for (const group of groupBracket.groups) {
            if (group.style === 'round-robin') {
                const groupMatches = matches.filter(m => m.groupId === group.groupId);
                const standings = calculateRoundRobinStandings(groupMatches, groupBracket.config);
                for (const s of standings) {
                    allStandings.push({ ...s, groupId: group.groupId });
                }
            }
            else if (group.style === 'gsl') {
                for (const adv of group.advancing || []) {
                    allStandings.push({
                        participantId: adv.participantId,
                        groupId: group.groupId,
                        rank: adv.seed,
                        status: 'advanced'
                    });
                }
                for (const elim of group.eliminated || []) {
                    allStandings.push({
                        participantId: elim,
                        groupId: group.groupId,
                        status: 'eliminated'
                    });
                }
            }
        }
        return allStandings;
    }
    isComplete(bracket, _matches) {
        const groupBracket = bracket;
        return groupBracket.groups.every(g => g.complete);
    }
    getWinner(_bracket, _matches) {
        return null;
    }
    getAdvancing(bracket) {
        return bracket.advancing;
    }
    getCurrentPhase(_bracket, _matches) {
        return 'groups';
    }
    getCurrentRound(bracket, _matches) {
        const groupBracket = bracket;
        let minRound = Infinity;
        for (const group of groupBracket.groups) {
            if (!group.complete && group.style === 'round-robin' && group.schedule) {
                for (let i = 0; i < group.schedule.matches.length; i++) {
                    const roundComplete = group.schedule.matches[i].every(m => m.status === 'completed');
                    if (!roundComplete) {
                        minRound = Math.min(minRound, i + 1);
                        break;
                    }
                }
            }
        }
        return minRound === Infinity ? 1 : minRound;
    }
}
//# sourceMappingURL=group-stage.js.map