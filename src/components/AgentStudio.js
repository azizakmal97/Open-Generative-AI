import { t } from '../lib/i18n.js';
import { HostedStudioEmbed } from './HostedStudioEmbed.js';

export function AgentStudio() {
    return HostedStudioEmbed({
        title: t('agents.title'),
        url: 'https://muapi.ai/agents',
    });
}
