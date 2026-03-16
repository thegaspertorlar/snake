---
name: create_repo_task
description: Publishes the Redis message CreateRepoTask to request creation of a RepoTask for a target repo from an OpenCode/chat-agent session. Use when the user or agent needs to create a repo task.
---

# Create Repo Task (Redis)

This skill triggers creation of a **RepoTask** by publishing the `CreateRepoTask` message to the `create-repo-task` Redis channel. The backend (agent-listener) subscribes to that channel and creates the task.

## When to use

- User or agent wants to create a repo task from the chat-agent (OpenCode session).
- You need to request the backend to create a RepoTask for a given target repo (name, optional description).

## Message shape (CreateRepoTask)

Payload must match

| Field            | Type   | Required | Description                    |
|------------------|--------|----------|--------------------------------|
| `target_repo_id` | string | yes      | Target repository id           |
| `name`           | string | yes      | Task name                      |
| `description`    | string | no       | Optional task description      |

## How to invoke

### How to run

The script uses the base-agent `AgentSDK` for Redis; run it from an environment where the SDK is available.

```bash
node scripts/publish-create-repo-task.js <target_repo_id> <name> [description]
```

Example:

```bash
node scripts/publish-create-repo-task.js "repo-uuid-456" "Implement login" "Add JWT-based auth"
```

## Scripts

- **scripts/publish-create-repo-task.js** – Publishes `CreateRepoTask` to Redis via base-agent `AgentSDK`.

## Backend behavior

The backend subscribes to `create-repo-task`, parses the payload, and calls `RepoTaskService.create(target_repo_id, { name, description, status: 'AGENT_DRAFT' })`. Ensure `target_repo_id` and `name` are set or the message is ignored.
