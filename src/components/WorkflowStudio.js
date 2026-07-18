import { t } from '../lib/i18n.js';
import { HostedStudioEmbed } from './HostedStudioEmbed.js';

export function WorkflowStudio() {
    return HostedStudioEmbed({
        title: t('workflows.title'),
        url: 'https://muapi.ai/workflow',
    });
}
