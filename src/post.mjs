// Publish a rendered image or video Story. No automatic republish after an
// ambiguous network error: creating another container could duplicate a post.
import { pathToFileURL } from 'node:url';

export async function postStory({
  userId, token, imageUrl, videoUrl, version = 'v25.0',
  fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 60
}) {
  if (!userId || !token) throw new Error('Missing IG_USER_ID or IG_ACCESS_TOKEN');
  if ((!imageUrl && !videoUrl) || (imageUrl && videoUrl)) throw new Error('Provide exactly one IMAGE_URL or VIDEO_URL');
  if (new URL(videoUrl || imageUrl).protocol !== 'https:') throw new Error('Media URL must use HTTPS');
  const graph = 'https://graph.instagram.com/' + version;
  async function request(path, params, method = 'POST') {
    const url = new URL(graph + '/' + path);
    const init = { method, headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30000) };
    if (method === 'POST') init.body = new URLSearchParams(params);
    else for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, init);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error('Instagram API request failed (HTTP ' + response.status + ', code ' + (data.error?.code ?? 'unknown') + ')');
    return data;
  }
  const container = await request(userId + '/media', {
    media_type: 'STORIES',
    ...(videoUrl ? { video_url: videoUrl } : { image_url: imageUrl })
  });
  if (!container.id) throw new Error('Instagram did not return a container ID');
  let ready = false;
  for (let i = 0; i < attempts; i++) {
    const state = await request(container.id, { fields: 'status_code' }, 'GET');
    if (state.status_code === 'FINISHED') { ready = true; break; }
    if (['ERROR', 'EXPIRED'].includes(state.status_code)) throw new Error('Instagram container status: ' + state.status_code);
    if (state.status_code === 'PUBLISHED') return { alreadyPublished: true };
    if (i < attempts - 1) await sleep(5000);
  }
  if (!ready) throw new Error('Instagram processing timed out; no publish request was sent');
  const result = await request(userId + '/media_publish', { creation_id: container.id });
  if (!result.id) throw new Error('Instagram did not confirm publication; check Instagram before retrying');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  postStory({
    userId: process.env.IG_USER_ID,
    token: process.env.IG_ACCESS_TOKEN,
    imageUrl: process.env.IMAGE_URL,
    videoUrl: process.env.VIDEO_URL,
    version: process.env.IG_GRAPH_VERSION || 'v25.0'
  }).then(result => console.log('[post] published:', result.id || 'already published'))
    .catch(error => { console.error('[post]', error.message); process.exitCode = 1; });
}
