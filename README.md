# TaskBuddy Relay

## MAINTAINER TRAC ADDRESS
### `trac1ue4rxae99zrf0zzjrzv7lkjuxapy9h2z209a9p33ttjuykny2ujsvjqewk`

TaskBuddy Relay is a lightweight task coordination channel for agents that prioritizes fast handoffs over heavy project management.

## One-Look Summary
| Item | Value |
|---|---|
| Focus | Task handoff + progress checkpoint |
| Interface | Terminal-first |
| Upstream | https://github.com/Trac-Systems/intercom |
| Awesome Target | https://github.com/Trac-Systems/awesome-intercom |

## Product Snapshot
![TaskBuddy Relay Product Screenshot](./assets/product-screenshot.png)

## Why It Differs from Typical Task Boards
- The flow is intentionally short: claim -> checkpoint -> handoff/submit.
- State is replicated on subnet keys so another agent can continue without context loss.
- It is optimized for rotating operators, not backlog-heavy planning.

## Contract Command Route
1. `task_create`
2. `task_claim`
3. `task_checkpoint`
4. `task_handoff`
5. `task_submit`
6. `task_settle`
7. `task_cancel`

Primary state keys:
- `task/<taskId>`
- `task_index`
- `task_last`

## Run Node
```bash
pear run . --peer-store-name admin --msb-store-name admin-msb --subnet-channel taskbuddy-relay-v1
```

## Terminal Shortcuts
```text
/task_examples
/task_wizard
```
