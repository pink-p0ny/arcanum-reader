import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AiError, CLOUD_URL, messageForFailure, normalizeServerUrl, resolveEndpoint } from './ai-core';

describe('normalizeServerUrl', () => {
  it('adds https, strips slashes and a pasted route', () => {
    assert.equal(normalizeServerUrl('ai.example.com'), 'https://ai.example.com');
    assert.equal(normalizeServerUrl('http://10.0.0.5:8787/'), 'http://10.0.0.5:8787');
    assert.equal(normalizeServerUrl('https://ai.example.com/v1/messages'), 'https://ai.example.com');
    assert.equal(normalizeServerUrl('https://ai.example.com/v1/'), 'https://ai.example.com');
    assert.equal(normalizeServerUrl('  '), '');
  });
});

describe('resolveEndpoint', () => {
  it('sends the Anthropic key only to Anthropic', () => {
    const ep = resolveEndpoint('byok', { anthropicKey: 'sk-ant-x' });
    assert.equal(ep.base, 'https://api.anthropic.com');
    assert.equal(ep.headers['x-api-key'], 'sk-ant-x');
    assert.equal(ep.headers.authorization, undefined);
  });
  it('uses the subscriber id as a bearer token for the hosted server', () => {
    const ep = resolveEndpoint('cloud', { subscriberId: '$RCAnonymousID:abc', anthropicKey: 'sk-ant-x' });
    assert.equal(ep.base, CLOUD_URL);
    assert.equal(ep.headers.authorization, 'Bearer $RCAnonymousID:abc');
    assert.equal(ep.headers['x-api-key'], undefined);
  });
  it('uses the shared token for a self-hosted server', () => {
    const ep = resolveEndpoint('self', { selfUrl: 'home.example.org/', selfToken: 't0k' });
    assert.equal(ep.base, 'https://home.example.org');
    assert.equal(ep.headers.authorization, 'Bearer t0k');
  });
  it('fails readably when something is missing', () => {
    assert.throws(() => resolveEndpoint('byok', {}), AiError);
    assert.throws(() => resolveEndpoint('cloud', {}), /App Store build/);
    assert.throws(() => resolveEndpoint('self', { selfUrl: 'x' }), /access token/);
    assert.throws(() => resolveEndpoint('off', {}), /off/);
  });
});

describe('messageForFailure', () => {
  it('maps statuses per mode', () => {
    assert.equal(messageForFailure('byok', 401, null), 'That API key was rejected.');
    assert.equal(messageForFailure('self', 401, null), 'The server rejected the access token.');
    assert.match(messageForFailure('cloud', 401, null), /Restore Purchases/);
    assert.match(messageForFailure('cloud', 402, {}), /not active/);
    assert.equal(messageForFailure('cloud', 429, { error: { message: 'Daily limit reached. It resets at midnight UTC.' } }), 'Daily limit reached. It resets at midnight UTC.');
    assert.equal(messageForFailure('byok', 500, { error: { message: 'overloaded' } }), 'overloaded');
    assert.equal(messageForFailure('byok', 500, null), 'HTTP 500');
  });
});
