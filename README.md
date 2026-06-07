# n8n-nodes-post-mate

Official [n8n](https://n8n.io) community nodes for [post mate](https://post-mate.com) — the social media scheduler that covers 13 networks.

![post mate nodes in n8n](https://post-mate.com/assets/n8n-node-preview.png)

## Nodes

| Node | Type | What it does |
|------|------|--------------|
| **Post Mate** | Action | Schedule posts, generate AI captions, read analytics, manage webhooks and metric alerts across 13 networks |
| **Post Mate Trigger** | Webhook trigger | Starts a workflow the instant a post publishes, fails, gets approved, or crosses an engagement threshold |

## Installation

### n8n Cloud / Desktop

Settings → Community Nodes → Install:

```
n8n-nodes-post-mate
```

### Self-hosted

```bash
npm install n8n-nodes-post-mate
# then restart n8n
```

## Credentials

1. Open **Settings → API** in your post mate dashboard
2. Create a full-scope key (`pm_live_…`) — it's shown once, copy it
3. In n8n, add a **Post Mate API** credential and paste the key
4. For self-hosted post mate, override the Base URL

## Post Mate node — resources & operations

### Post

| Operation | Endpoint |
|-----------|----------|
| Schedule / Create | `POST /api/v1/posts` |
| Get | `GET /api/v1/posts/:id` |
| Get Many | `GET /api/v1/posts` |
| Cancel | `DELETE /api/v1/posts/:id` |
| Approve | `POST /api/v1/posts/:id/approve` |
| Request Changes | `POST /api/v1/posts/:id/request-changes` |

### Caption (AI)

| Operation | Endpoint |
|-----------|----------|
| Generate | `POST /api/v1/ai/caption` |
| Hashtags | `POST /api/v1/ai/hashtags` |
| Translate | `POST /api/v1/ai/translate` |

### Account

| Operation | Endpoint |
|-----------|----------|
| Get Many | `GET /api/v1/accounts` |

### Analytics

| Operation | Endpoint |
|-----------|----------|
| Get | `GET /api/v1/analytics` |

### Media

| Operation | Endpoint |
|-----------|----------|
| Upload | `POST /api/v1/media` (multipart/form-data, max 50 MB) |

### Webhook

| Operation | Endpoint |
|-----------|----------|
| List | `GET /api/v1/webhooks` |
| Create | `POST /api/v1/webhooks` |
| Test (Ping) | `POST /api/v1/webhooks/:id/test` |
| Delete | `DELETE /api/v1/webhooks/:id` |

### Metric Alert

| Operation | Endpoint |
|-----------|----------|
| List | `GET /api/v1/metric-alerts` |
| Create | `POST /api/v1/metric-alerts` |
| Delete | `DELETE /api/v1/metric-alerts/:id` |

## Post Mate Trigger — events

| Event | When it fires |
|-------|---------------|
| `post.published` | A post successfully publishes to a social network |
| `post.failed` | A post fails after all retries |
| `post.scheduled` | A post enters the scheduled queue |
| `post.approved` | A pending-approval post is approved |
| `post.changes_requested` | A reviewer sends a post back to draft |
| `post.metric_threshold` | A post crosses a configured engagement threshold |

Every delivery is **HMAC-SHA256** signed. The trigger node verifies the signature automatically — invalid or replayed requests (>5 min old) are rejected with 401.

## Workflow examples

### Blog → everywhere

```
RSS Feed → Post Mate (Caption: Generate) → Post Mate (Post: Schedule)
```

### Failure → Slack alert

```
Post Mate Trigger (post.failed) → Slack (send message to #on-call)
```

### Approve-and-publish from Slack

```
Post Mate Trigger (post.changes_requested) → Slack (send approval request)
Slack Trigger (button clicked) → Post Mate (Post: Approve)
```

### Daily analytics → Google Sheets

```
Schedule Trigger (every morning) → Post Mate (Analytics: Get) → Google Sheets (append row)
```

## Authentication

All requests use `Authorization: Bearer pm_live_…`. The same key powers the n8n integration, direct REST API calls, and the MCP server — rotate or revoke it any time from **Settings → API**.

## Plans

The REST API and outbound webhooks require a **Pro plan** or active trial.

## Links

- [Post mate n8n integration page](https://post-mate.com/integrations/n8n)
- [API reference](https://docs.post-mate.com/api)
- [Webhook docs](https://docs.post-mate.com/webhooks)
- [Support](mailto:support@post-mate.com)

## License

MIT
