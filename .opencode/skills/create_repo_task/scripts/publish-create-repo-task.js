#!/usr/bin/env node
/**
 * Publishes CreateRepoTask to Redis channel 'create-repo-task'.
 * Requires base-agent AgentSDK (run from chat-agent container or monorepo with agents/base-agent built).
 * No extra dependencies (no package.json / ioredis in this skill).
 *
 * Usage:
 *   node publish-create-repo-task.js <target_repo_id> <name> [description]
 *
 * Env: REDIS_HOST, REDIS_PASSWORD (optional) – used by AgentSDK when connecting.
 */

const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const [target_repo_id, name, description] = args;

if (!target_repo_id || !name) {
    console.error('Usage: node publish-create-repo-task.js <target_repo_id> <name> [description]');
    process.exit(1);
}

/** @type {{ target_repo_id: string, name: string, description?: string }} */
const payload = {
    target_repo_id,
    name,
    ...(description !== undefined && description !== '' && { description }),
};

const CHANNEL = 'create-repo-task';

function getSdkPath() {
    if (process.env.AGENT_SDK_PATH) return process.env.AGENT_SDK_PATH;
    if (fs.existsSync('/app/dist/agent-sdk.js')) return '/app/dist/agent-sdk.js';
    const fromScript = path.resolve(__dirname, '../../agents/base-agent/dist/agent-sdk.js');
    if (fs.existsSync(fromScript)) return fromScript;
    return '/app/dist/agent-sdk.js';
}

async function publishWithSDK() {
    const sdkPath = getSdkPath();
    const { AgentSDK } = require(sdkPath);
    const sdk = new AgentSDK();
    await sdk.redis.publish(CHANNEL, JSON.stringify(payload));
    await sdk.disconnect('CreateRepoTask published');
}

async function main() {
    console.log(`[CreateRepoTask] Publishing to ${CHANNEL}:`, payload);

    try {
        await publishWithSDK();
        console.log('[CreateRepoTask] Successfully published to create-repo-task');
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
            console.error('[CreateRepoTask] AgentSDK not found. Run this script from the chat-agent container or from the monorepo with agents/base-agent built (no package.json or ioredis in this skill).');
        } else {
            console.error('[CreateRepoTask] Failed to publish:', err.message);
        }
        process.exit(1);
    }
}

main();
