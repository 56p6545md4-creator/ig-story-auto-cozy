import test from 'node:test';
import assert from 'node:assert/strict';
import { postStory } from '../src/post.mjs';
const base = { userId: 'user', token: 'dummy', imageUrl: 'https://example.com/story.png', sleep: async () => {} };
function api(states, publish = {id: 'story'}) {
  const calls = [];
  return {calls, fetchImpl: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path.endsWith('/media_publish')) {
      if (publish instanceof Error) throw publish;
      return {ok: true, json: async () => publish};
    }
    return {ok: true, json: async () => path.endsWith('/media') ? {id: 'container'} : {status_code: states.shift()}};
  }};
}
test('claim is durable before publish; image and video work', async () => {
  for (const media of [{imageUrl: base.imageUrl}, {imageUrl: undefined, videoUrl: 'https://example.com/story.mp4'}]) {
    const mock = api(['IN_PROGRESS', 'FINISHED']);
    let claimed = false;
    const fetchImpl = async (url, init) => {
      if (String(url).endsWith('/media_publish')) assert.equal(claimed, true);
      return mock.fetchImpl(url, init);
    };
    assert.equal((await postStory({...base, ...media, fetchImpl, beforePublish: async () => { claimed = true; }})).id, 'story');
  }
});
test('failed claim prevents publish request', async () => {
  const mock = api(['FINISHED']);
  await assert.rejects(postStory({...base, ...mock, beforePublish: async () => {throw Error('push failed');}}), /push failed/);
  assert.equal(mock.calls.some(x => x.endsWith('/media_publish')), false);
});
test('container failure or timeout does not claim; backup may retry', async () => {
  for (const state of ['ERROR', 'EXPIRED', 'IN_PROGRESS']) {
    const mock = api([state]);
    await assert.rejects(postStory({...base, ...mock, attempts: 1, beforePublish: async () => assert.fail('must not claim')}));
    assert.equal(mock.calls.length, 2);
  }
});
test('ambiguous publish failure is never retried', async () => {
  const mock = api(['FINISHED'], Error('connection lost'));
  let claims = 0;
  await assert.rejects(postStory({...base, ...mock, beforePublish: async () => {claims++;}}), /connection lost/);
  assert.equal(claims, 1);
  assert.equal(mock.calls.filter(x => x.endsWith('/media_publish')).length, 1);
});
test('missing publication confirmation fails', async () => {
  await assert.rejects(postStory({...base, ...api(['FINISHED'], {})}), /did not confirm/);
});
test('invalid input never contacts Instagram', async () => {
  await assert.rejects(postStory({...base, imageUrl: 'http://example.com/image', fetchImpl: () => assert.fail()}), /HTTPS/);
});
