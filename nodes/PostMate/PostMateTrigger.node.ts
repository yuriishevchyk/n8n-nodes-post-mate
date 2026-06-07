import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  ICredentialDataDecryptedObject,
  IDataObject,
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// ---------------------------------------------------------------------------
// HTTP helper scoped to IHookFunctions (used in webhookMethods lifecycle).
// ---------------------------------------------------------------------------
async function apiRequest(
  this: IHookFunctions,
  credentials: ICredentialDataDecryptedObject,
  method: string,
  endpoint: string,
  body?: IDataObject,
): Promise<IDataObject> {
  const baseUrl = ((credentials.baseUrl as string) ?? 'https://post-mate.com').replace(/\/$/, '');
  const options: IDataObject = {
    method,
    url: `${baseUrl}/api/v1${endpoint}`,
    headers: {
      Authorization: `Bearer ${credentials.apiKey as string}`,
      'Content-Type': 'application/json',
    },
    json: true,
  };
  if (body && Object.keys(body).length) options.body = body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return this.helpers.request(options as any);
}

// ---------------------------------------------------------------------------
// Verify an incoming post mate webhook request.
// Returns true if the HMAC-SHA256 signature is valid and the timestamp
// is within 5 minutes. Constant-time comparison prevents timing attacks.
// ---------------------------------------------------------------------------
function verifySignature(
  secret: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  rawBody: string,
): boolean {
  if (!signatureHeader || !timestampHeader) return false;

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const match = /^sha256=([0-9a-f]+)$/i.exec(signatureHeader);
  if (!match) return false;

  const expected = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(match[1]!, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------
export class PostMateTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Post Mate Trigger',
    name: 'postMateTrigger',
    icon: 'file:postmate.svg',
    group: ['trigger'],
    version: 1,
    description:
      'Starts the workflow when post mate events occur (post published, failed, approved, etc.)',
    defaults: { name: 'Post Mate Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'postMateApi', required: true }],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        options: [
          {
            name: 'Post Published',
            value: 'post.published',
            description: 'Fires when a post successfully publishes to a network',
          },
          {
            name: 'Post Failed',
            value: 'post.failed',
            description: 'Fires when a post fails to publish after all retries',
          },
          {
            name: 'Post Scheduled',
            value: 'post.scheduled',
            description: 'Fires when a post moves into the scheduled state',
          },
          {
            name: 'Post Approved',
            value: 'post.approved',
            description: 'Fires when a pending_approval post is approved',
          },
          {
            name: 'Post Changes Requested',
            value: 'post.changes_requested',
            description: 'Fires when a reviewer requests changes on a pending_approval post',
          },
          {
            name: 'Post Metric Threshold',
            value: 'post.metric_threshold',
            description: 'Fires when a post crosses a configured engagement threshold',
          },
        ],
        default: ['post.published', 'post.failed'],
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add option',
        default: {},
        options: [
          {
            displayName: 'Skip Signature Verification',
            name: 'skipVerification',
            type: 'boolean',
            default: false,
            description:
              'Whether to disable HMAC-SHA256 signature verification — only for testing behind an isolated network',
          },
        ],
      },
    ],
  };

  // =========================================================================
  // Lifecycle — called by n8n when the workflow is activated/deactivated.
  // Uses POST /v1/webhooks to register and DELETE to tear down.
  // The webhook ID and secret are stored in static data so the trigger
  // can verify incoming signatures and clean up on deactivation.
  // =========================================================================
  webhookMethods = {
    default: {
      /**
       * Returns true if a webhook is already registered for this node
       * activation. n8n skips `create` if this returns true.
       */
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node');
        if (!staticData.webhookId) return false;

        // Verify the webhook still exists in post mate (it might have been
        // deleted manually from the dashboard).
        try {
          const credentials = await this.getCredentials('postMateApi');
          await apiRequest.call(this, credentials, 'GET', `/webhooks/${staticData.webhookId as string}`);
          return true;
        } catch {
          // Deleted externally — clear stale state and let n8n re-create.
          delete staticData.webhookId;
          delete staticData.webhookSecret;
          return false;
        }
      },

      /**
       * Registers a new webhook in post mate and stores the ID + secret.
       * The secret is used later to verify incoming HMAC signatures.
       */
      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const events = this.getNodeParameter('events') as string[];

        if (!events.length) {
          throw new NodeOperationError(this.getNode(), 'Select at least one event to subscribe to.');
        }

        const credentials = await this.getCredentials('postMateApi');
        let response: IDataObject;
        try {
          response = await apiRequest.call(this, credentials, 'POST', '/webhooks', {
            url: webhookUrl,
            events,
          });
        } catch (err) {
          throw new NodeOperationError(
            this.getNode(),
            `Failed to register webhook in post mate: ${(err as Error).message}`,
          );
        }

        if (!response.id) {
          throw new NodeOperationError(
            this.getNode(),
            'post mate did not return a webhook ID. Check your API key scope (must be full).',
          );
        }

        const staticData = this.getWorkflowStaticData('node');
        staticData.webhookId = response.id;
        // `secret` is only returned at creation time and never again.
        staticData.webhookSecret = response.secret ?? null;

        return true;
      },

      /**
       * Deletes the registered webhook from post mate on workflow deactivation.
       */
      async delete(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node');
        if (!staticData.webhookId) return true;

        try {
          const credentials = await this.getCredentials('postMateApi');
          await apiRequest.call(this, credentials, 'DELETE', `/webhooks/${staticData.webhookId as string}`);
        } catch {
          // Best-effort — the webhook may already be gone.
        }

        delete staticData.webhookId;
        delete staticData.webhookSecret;
        return true;
      },
    },
  };

  // =========================================================================
  // webhook — handles every POST that post mate delivers to this node's URL.
  // =========================================================================
  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const options = this.getNodeParameter('options', {}) as IDataObject;

    // Reconstruct raw body for signature verification. n8n parses the body
    // before we see it, so re-serialise from the parsed object.
    const bodyData = this.getBodyData() as IDataObject;
    const rawBody = JSON.stringify(bodyData);

    // ---- HMAC-SHA256 signature verification ----
    const skipVerification = options.skipVerification === true;
    if (!skipVerification) {
      const staticData = this.getWorkflowStaticData('node');
      const secret = staticData.webhookSecret as string | undefined;

      if (secret) {
        const signature = req.headers['x-postmate-signature'] as string | undefined;
        const timestamp = req.headers['x-postmate-timestamp'] as string | undefined;

        if (!verifySignature(secret, signature, timestamp, rawBody)) {
          // Return 401 — n8n will not emit the workflow.
          return {
            webhookResponse: {
              status: 401,
              body: JSON.stringify({ error: 'invalid_signature', message: 'HMAC verification failed or timestamp expired (>5 min).' }),
              headers: { 'content-type': 'application/json' },
            },
          };
        }
      }
      // If `secret` is null (webhook registered before this was stored), we
      // let the event through — a misconfiguration rather than an attack.
    }

    // ---- Emit the event payload downstream ----
    return {
      workflowData: [[{ json: bodyData }]],
    };
  }
}
