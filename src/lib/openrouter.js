/**
 * OpenRouter (openrouter.ai) provider support.
 *
 * An OpenRouter API key (sk-or-...) can be pasted in Settings in place of a
 * Muapi key. Requests are then routed to OpenRouter:
 *   - Images (T2I / I2I) via chat completions with image output modality.
 *   - Video (T2V / I2V) via the async /api/v1/videos job API.
 * Uploaded reference images stay local as data URLs instead of being uploaded.
 * V2V tools and lip-sync have no OpenRouter equivalent and remain Muapi-only.
 */

const BASE_URL = 'https://openrouter.ai/api/v1';

export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';
export const DEFAULT_VIDEO_MODEL = 'google/veo-3.1';

export function isOpenRouterKey(key) {
    return typeof key === 'string' && key.startsWith('sk-or-');
}

export function getImageModel() {
    return localStorage.getItem('openrouter_image_model') || DEFAULT_IMAGE_MODEL;
}

export function getVideoModel() {
    return localStorage.getItem('openrouter_video_model') || DEFAULT_VIDEO_MODEL;
}

function headers(key) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://github.com/Anil-matcha/Open-Generative-AI',
        'X-Title': 'Open Generative AI',
    };
}

/** Reads a File/Blob as a data URL so images never leave the machine. */
export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function toDataUrl(url) {
    if (!url) return null;
    if (typeof url === 'string' && url.startsWith('data:')) return url;
    const blob = await (await fetch(url)).blob();
    return fileToDataUrl(blob);
}

/**
 * Generates or edits an image through chat completions with image output.
 * @param {string} key - OpenRouter API key
 * @param {Object} opts
 * @param {string} opts.prompt
 * @param {string[]} [opts.imageUrls] - Reference images (data or hosted URLs)
 * @param {string} [opts.aspectRatio] - Passed as a prompt hint
 * @returns {Promise<{status: string, url: string, outputs: string[]}>}
 */
export async function generateImage(key, { prompt, imageUrls, aspectRatio }) {
    let text = (prompt || '').trim() || 'Generate an image.';
    if (aspectRatio) text += `\n\nGenerate the image with aspect ratio ${aspectRatio}.`;

    const content = [{ type: 'text', text }];
    for (const url of imageUrls || []) {
        const dataUrl = await toDataUrl(url);
        if (dataUrl) content.push({ type: 'image_url', image_url: { url: dataUrl } });
    }

    const body = {
        model: getImageModel(),
        messages: [{ role: 'user', content }],
        modalities: ['image', 'text'],
    };

    console.log('[OpenRouter] Image request:', body.model);
    const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter request failed: ${response.status} - ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(`OpenRouter error: ${(data.error.message || JSON.stringify(data.error)).slice(0, 200)}`);
    }

    const message = data.choices?.[0]?.message;
    const imageUrl = message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
        const said = message?.content ? String(message.content).slice(0, 180) : '';
        throw new Error(
            'OpenRouter returned no image. ' +
            (said ? `Model said: ${said}` : `Make sure the model in Settings supports image output (e.g. ${DEFAULT_IMAGE_MODEL}).`)
        );
    }

    console.log('[OpenRouter] Image received');
    return { status: 'completed', url: imageUrl, outputs: [imageUrl] };
}

/**
 * Generates a video through the async /api/v1/videos job API
 * (submit -> poll polling_url -> download).
 * @param {string} key - OpenRouter API key
 * @param {Object} params - Same shape the Muapi client receives
 * @returns {Promise<{status: string, url: string, outputs: string[]}>}
 */
export async function generateVideo(key, params) {
    const body = {
        model: getVideoModel(),
        prompt: (params.prompt || '').trim() || 'Generate a video.',
    };
    if (params.duration) body.duration = Number(params.duration) || undefined;
    if (params.resolution) body.resolution = params.resolution;
    if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
    if (params.seed && params.seed !== -1) body.seed = params.seed;

    const imageUrl = params.image_url || params.images_list?.[0];
    if (imageUrl) {
        body.frame_images = [{ type: 'image_url', image_url: { url: imageUrl }, frame_type: 'first_frame' }];
        if (params.last_image) {
            body.frame_images.push({ type: 'image_url', image_url: { url: params.last_image }, frame_type: 'last_frame' });
        }
    }

    console.log('[OpenRouter] Video request:', body.model, body);
    const response = await fetch(`${BASE_URL}/videos`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter video request failed: ${response.status} - ${errText.slice(0, 300)}`);
    }

    const job = await response.json();
    if (job.error) {
        throw new Error(`OpenRouter error: ${(job.error.message || JSON.stringify(job.error)).slice(0, 300)}`);
    }
    if (params.onRequestId && job.id) params.onRequestId(job.id);

    // Poll every 10s for up to 30 minutes.
    let status = job;
    for (let attempt = 0; attempt < 180 && status.status !== 'completed'; attempt++) {
        if (['failed', 'cancelled', 'expired'].includes(status.status)) {
            throw new Error(`OpenRouter video generation ${status.status}: ${status.error?.message || status.error || 'unknown error'}`);
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
        try {
            const pollUrl = new URL(status.polling_url || job.polling_url || `/api/v1/videos/${job.id}`, 'https://openrouter.ai').toString();
            const pollResponse = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${key}` } });
            if (!pollResponse.ok) {
                console.warn('[OpenRouter] Poll error:', pollResponse.status);
                continue;
            }
            status = await pollResponse.json();
            console.log('[OpenRouter] Video status:', status.status);
        } catch (error) {
            console.warn('[OpenRouter] Poll attempt failed:', error.message);
        }
    }

    if (status.status !== 'completed') throw new Error('OpenRouter video generation timed out after 30 minutes.');

    let url = status.unsigned_urls?.[0];
    if (!url) {
        const contentResponse = await fetch(`${BASE_URL}/videos/${job.id}/content?index=0`, {
            headers: { 'Authorization': `Bearer ${key}` },
        });
        if (!contentResponse.ok) throw new Error(`OpenRouter video download failed: ${contentResponse.status}`);
        url = URL.createObjectURL(await contentResponse.blob());
    }

    console.log('[OpenRouter] Video ready');
    return { status: 'completed', url, outputs: [url] };
}
