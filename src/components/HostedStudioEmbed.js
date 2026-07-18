import { t, tf } from '../lib/i18n.js';

/**
 * Embeds a hosted (muapi.ai) studio inside the desktop app via <webview>.
 * These studios run on muapi's web backend, so they need internet access and
 * a muapi.ai account; they cannot run offline or against an OpenRouter key.
 * Falls back to an open-in-browser prompt when <webview> is unavailable
 * (i.e. running outside Electron, or webviewTag disabled).
 */
export function HostedStudioEmbed({ title, url }) {
    const container = document.createElement('div');
    container.className = 'w-full h-full relative bg-app-bg';

    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;top:0;left:0;right:0;height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;background:#0d0d0d;border-bottom:1px solid rgba(255,255,255,0.06);z-index:2;';
    const note = document.createElement('span');
    note.style.cssText = 'font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);';
    note.textContent = tf('hosted.note', title);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.style.cssText = 'font-size:11px;font-weight:700;color:var(--color-primary,#22d3ee);text-decoration:none;cursor:pointer;';
    link.textContent = t('hosted.openBrowser');
    bar.appendChild(note);
    bar.appendChild(link);
    container.appendChild(bar);

    const isElectron = /electron/i.test(navigator.userAgent);
    if (isElectron) {
        const webview = document.createElement('webview');
        webview.setAttribute('src', url);
        webview.setAttribute('allowpopups', 'true');
        webview.setAttribute('partition', 'persist:muapiweb');
        webview.style.cssText = 'position:absolute;top:34px;left:0;right:0;bottom:0;width:100%;height:calc(100% - 34px);';
        container.appendChild(webview);
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'w-full h-full flex flex-col items-center justify-center text-white gap-3';
        fallback.style.paddingTop = '34px';
        fallback.innerHTML = `
            <p class="text-lg font-bold opacity-60">${title}</p>
            <a href="${url}" target="_blank" rel="noreferrer" class="text-sm underline opacity-70 hover:opacity-100">${t('hosted.openBrowser')}</a>
        `;
        container.appendChild(fallback);
    }

    return container;
}
