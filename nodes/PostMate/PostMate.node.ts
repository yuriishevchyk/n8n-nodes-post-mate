import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// ---------------------------------------------------------------------------
// HTTP helper — wraps Bearer auth + JSON round-trip for all /api/v1 calls.
// ---------------------------------------------------------------------------
async function apiRequest(
  this: IExecuteFunctions,
  method: string,
  endpoint: string,
  body?: IDataObject,
  qs?: IDataObject,
): Promise<IDataObject> {
  const credentials = await this.getCredentials('postMateApi');
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
  if (qs && Object.keys(qs).length) options.qs = qs;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return this.helpers.request(options as any);
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------
export class PostMate implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Post Mate',
    name: 'postMate',
    icon: 'file:postmate.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Schedule posts, generate captions and manage social media across 13 networks',
    defaults: { name: 'Post Mate' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'postMateApi', required: true }],
    properties: [
      // ---- Resource selector ----
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Post', value: 'post' },
          { name: 'Caption (AI)', value: 'caption' },
          { name: 'Account', value: 'account' },
          { name: 'Analytics', value: 'analytics' },
          { name: 'Media', value: 'media' },
          { name: 'Webhook', value: 'webhook' },
          { name: 'Metric Alert', value: 'metricAlert' },
        ],
        default: 'post',
      },

      // ================================================================
      // POST operations
      // ================================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['post'] } },
        options: [
          { name: 'Schedule / Create', value: 'schedule', action: 'Schedule or create a post' },
          { name: 'Get', value: 'get', action: 'Get a post by ID' },
          { name: 'Get Many', value: 'getMany', action: 'Get many posts' },
          { name: 'Cancel', value: 'cancel', action: 'Cancel a draft or scheduled post' },
          { name: 'Approve', value: 'approve', action: 'Approve a pending_approval post' },
          { name: 'Request Changes', value: 'requestChanges', action: 'Request changes on a pending_approval post' },
        ],
        default: 'schedule',
      },

      // schedule — required fields
      {
        displayName: 'Type',
        name: 'type',
        type: 'options',
        options: [
          { name: 'Text', value: 'text' },
          { name: 'Image', value: 'image' },
          { name: 'Video', value: 'video' },
          { name: 'Story', value: 'story' },
        ],
        default: 'text',
        required: true,
        displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
      },
      {
        displayName: 'Caption',
        name: 'caption',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
        description: 'Main caption shared across networks unless overridden per account',
      },
      {
        displayName: 'Social Account IDs',
        name: 'socialAccountIds',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'uuid1,uuid2,uuid3',
        displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
        description: 'Comma-separated list of connected social account UUIDs. Retrieve IDs from the Account → Get Many operation.',
      },
      {
        displayName: 'Scheduled At',
        name: 'scheduledAt',
        type: 'dateTime',
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
        description: 'ISO 8601 datetime. Leave blank to publish immediately.',
      },
      {
        displayName: 'Timezone',
        name: 'timezone',
        type: 'string',
        default: 'UTC',
        displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
      },
      {
        displayName: 'Media Keys (JSON)',
        name: 'mediaJson',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
        description: 'Optional JSON array of media objects from POST /v1/media. Example: [{"key":"r2/…","mime_type":"image/jpeg","size_bytes":204800}]',
      },

      // get / cancel / approve / requestChanges — post ID
      {
        displayName: 'Post ID',
        name: 'postId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: { resource: ['post'], operation: ['get', 'cancel', 'approve', 'requestChanges'] },
        },
      },
      {
        displayName: 'Reviewer Note',
        name: 'reviewerNote',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['requestChanges'] } },
        description: 'Optional message sent back to the author in the webhook payload',
      },

      // getMany — optional filters
      {
        displayName: 'Status Filter',
        name: 'statusFilter',
        type: 'options',
        options: [
          { name: 'All', value: '' },
          { name: 'Draft', value: 'draft' },
          { name: 'Scheduled', value: 'scheduled' },
          { name: 'Publishing', value: 'publishing' },
          { name: 'Posted', value: 'posted' },
          { name: 'Failed', value: 'failed' },
          { name: 'Partial', value: 'partial' },
          { name: 'Pending Approval', value: 'pending_approval' },
        ],
        default: '',
        displayOptions: { show: { resource: ['post'], operation: ['getMany'] } },
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 100 },
        default: 50,
        displayOptions: { show: { resource: ['post'], operation: ['getMany'] } },
      },

      // ================================================================
      // CAPTION (AI) operations
      // ================================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['caption'] } },
        options: [
          { name: 'Generate', value: 'generate', action: 'Generate 5 caption variants' },
          { name: 'Hashtags', value: 'hashtags', action: 'Suggest relevant hashtags' },
          { name: 'Translate', value: 'translate', action: 'Translate a caption' },
        ],
        default: 'generate',
      },
      {
        displayName: 'Topic',
        name: 'topic',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['caption'], operation: ['generate'] } },
        description: 'Topic seed for caption generation. Leave blank for ambient angles.',
      },
      {
        displayName: 'Platforms',
        name: 'platforms',
        type: 'multiOptions',
        options: [
          { name: 'Instagram', value: 'instagram' },
          { name: 'TikTok', value: 'tiktok' },
          { name: 'LinkedIn', value: 'linkedin' },
          { name: 'X (Twitter)', value: 'x' },
          { name: 'Threads', value: 'threads' },
          { name: 'YouTube', value: 'youtube' },
          { name: 'Facebook', value: 'facebook' },
          { name: 'Bluesky', value: 'bluesky' },
          { name: 'Pinterest', value: 'pinterest' },
        ],
        default: [],
        displayOptions: { show: { resource: ['caption'], operation: ['generate'] } },
        description: 'Optimise tone and length for these networks',
      },
      {
        displayName: 'Tone',
        name: 'tone',
        type: 'options',
        options: [
          { name: 'Friendly', value: 'friendly' },
          { name: 'Witty', value: 'witty' },
          { name: 'Punchy', value: 'punchy' },
          { name: 'Professional', value: 'professional' },
          { name: 'Storyteller', value: 'storyteller' },
        ],
        default: 'friendly',
        displayOptions: { show: { resource: ['caption'], operation: ['generate'] } },
      },
      {
        displayName: 'Max Characters',
        name: 'maxChars',
        type: 'number',
        typeOptions: { minValue: 50, maxValue: 2200 },
        default: 220,
        displayOptions: { show: { resource: ['caption'], operation: ['generate'] } },
      },
      // hashtags
      {
        displayName: 'Caption',
        name: 'hashtagCaption',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        displayOptions: { show: { resource: ['caption'], operation: ['hashtags'] } },
        description: 'Caption to base hashtag suggestions on (use either this or Topic)',
      },
      {
        displayName: 'Topic',
        name: 'hashtagTopic',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['caption'], operation: ['hashtags'] } },
        description: 'Free-text topic if no caption is available',
      },
      {
        displayName: 'Platform',
        name: 'hashtagPlatform',
        type: 'string',
        default: '',
        placeholder: 'instagram',
        displayOptions: { show: { resource: ['caption'], operation: ['hashtags'] } },
        description: 'Optional — platform-specific hashtag norms vary',
      },
      {
        displayName: 'Count',
        name: 'hashtagCount',
        type: 'number',
        typeOptions: { minValue: 3, maxValue: 30 },
        default: 15,
        displayOptions: { show: { resource: ['caption'], operation: ['hashtags'] } },
      },
      // translate
      {
        displayName: 'Text to Translate',
        name: 'translateText',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        required: true,
        displayOptions: { show: { resource: ['caption'], operation: ['translate'] } },
      },
      {
        displayName: 'Target Language',
        name: 'targetLang',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Ukrainian',
        displayOptions: { show: { resource: ['caption'], operation: ['translate'] } },
        description: 'Human-readable language name (not ISO code) — regional flavour is picked automatically',
      },
      {
        displayName: 'Preserve Voice',
        name: 'keepVoice',
        type: 'boolean',
        default: true,
        displayOptions: { show: { resource: ['caption'], operation: ['translate'] } },
        description: 'When true, preserves brand voice, line breaks, emoji and hashtags',
      },

      // ================================================================
      // ACCOUNT operations
      // ================================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['account'] } },
        options: [
          { name: 'Get Many', value: 'getMany', action: 'Get all connected social accounts' },
        ],
        default: 'getMany',
      },

      // ================================================================
      // ANALYTICS operations
      // ================================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['analytics'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get engagement metrics' },
        ],
        default: 'get',
      },
      {
        displayName: 'Window (days)',
        name: 'windowDays',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 180 },
        default: 30,
        displayOptions: { show: { resource: ['analytics'], operation: ['get'] } },
      },

      // ================================================================
      // MEDIA operations
      // ================================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['media'] } },
        options: [
          { name: 'Upload', value: 'upload', action: 'Upload a file for use in posts' },
        ],
        default: 'upload',
      },
      {
        displayName: 'Binary Property',
        name: 'binaryProperty',
        type: 'string',
        default: 'data',
        required: true,
        displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
        description: 'Name of the binary property that contains the file to upload (max 50 MB)',
      },

      // ================================================================
      // WEBHOOK operations
      // ================================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['webhook'] } },
        options: [
          { name: 'List', value: 'getMany', action: 'List all registered webhooks' },
          { name: 'Create', value: 'create', action: 'Register a new webhook endpoint' },
          { name: 'Test (Ping)', value: 'test', action: 'Send a test ping to a webhook' },
          { name: 'Delete', value: 'delete', action: 'Delete a webhook' },
        ],
        default: 'getMany',
      },
      {
        displayName: 'Webhook URL',
        name: 'webhookUrl',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
      },
      {
        displayName: 'Events',
        name: 'webhookEvents',
        type: 'multiOptions',
        options: [
          { name: 'Post Published', value: 'post.published' },
          { name: 'Post Failed', value: 'post.failed' },
          { name: 'Post Scheduled', value: 'post.scheduled' },
          { name: 'Post Approved', value: 'post.approved' },
          { name: 'Post Changes Requested', value: 'post.changes_requested' },
          { name: 'Post Metric Threshold', value: 'post.metric_threshold' },
        ],
        default: ['post.published', 'post.failed'],
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
      },
      {
        displayName: 'Webhook ID',
        name: 'webhookId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['test', 'delete'] } },
      },

      // ================================================================
      // METRIC ALERT operations
      // ================================================================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['metricAlert'] } },
        options: [
          { name: 'List', value: 'getMany', action: 'List all metric alerts' },
          { name: 'Create', value: 'create', action: 'Create a threshold alert' },
          { name: 'Delete', value: 'delete', action: 'Delete a metric alert' },
        ],
        default: 'getMany',
      },
      {
        displayName: 'Metric',
        name: 'metric',
        type: 'options',
        options: [
          { name: 'Impressions', value: 'impressions' },
          { name: 'Views', value: 'views' },
          { name: 'Likes', value: 'likes' },
          { name: 'Comments', value: 'comments' },
          { name: 'Shares', value: 'shares' },
          { name: 'Saves', value: 'saves' },
          { name: 'Reach', value: 'reach' },
        ],
        default: 'impressions',
        required: true,
        displayOptions: { show: { resource: ['metricAlert'], operation: ['create'] } },
      },
      {
        displayName: 'Threshold',
        name: 'threshold',
        type: 'number',
        typeOptions: { minValue: 1 },
        default: 1000,
        required: true,
        displayOptions: { show: { resource: ['metricAlert'], operation: ['create'] } },
        description: 'Alert fires once when the metric crosses this value',
      },
      {
        displayName: 'Post ID (optional)',
        name: 'alertPostId',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['metricAlert'], operation: ['create'] } },
        description: 'Watch a specific post. Leave blank to watch all workspace posts.',
      },
      {
        displayName: 'Alert ID',
        name: 'alertId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['metricAlert'], operation: ['delete'] } },
      },
    ],
  };

  // =========================================================================
  // execute — route by resource / operation
  // =========================================================================
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let responseData: IDataObject | IDataObject[];

        // ------------------------------------------------------------------
        if (resource === 'post') {
          // ---- schedule ----
          if (operation === 'schedule') {
            const type = this.getNodeParameter('type', i) as string;
            const caption = this.getNodeParameter('caption', i) as string;
            const socialAccountIdsRaw = this.getNodeParameter('socialAccountIds', i) as string;
            const scheduledAt = this.getNodeParameter('scheduledAt', i, '') as string;
            const timezone = this.getNodeParameter('timezone', i, 'UTC') as string;
            const mediaJson = this.getNodeParameter('mediaJson', i, '') as string;

            const socialAccountIds = socialAccountIdsRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

            if (socialAccountIds.length === 0) {
              throw new NodeOperationError(this.getNode(), 'Social Account IDs must not be empty.', { itemIndex: i });
            }

            const body: IDataObject = {
              type,
              caption,
              social_account_ids: socialAccountIds,
              timezone,
            };
            if (scheduledAt) body.scheduled_at = scheduledAt;
            if (mediaJson.trim()) {
              try {
                body.media = JSON.parse(mediaJson);
              } catch {
                throw new NodeOperationError(this.getNode(), 'Media Keys (JSON) is not valid JSON.', { itemIndex: i });
              }
            }

            responseData = await apiRequest.call(this, 'POST', '/posts', body);
          }

          // ---- get ----
          else if (operation === 'get') {
            const postId = this.getNodeParameter('postId', i) as string;
            responseData = await apiRequest.call(this, 'GET', `/posts/${postId}`);
          }

          // ---- getMany ----
          else if (operation === 'getMany') {
            const status = this.getNodeParameter('statusFilter', i, '') as string;
            const limit = this.getNodeParameter('limit', i, 50) as number;
            const qs: IDataObject = { limit };
            if (status) qs.status = status;
            const res = await apiRequest.call(this, 'GET', '/posts', undefined, qs) as IDataObject;
            responseData = (res.posts as IDataObject[]) ?? [];
          }

          // ---- cancel ----
          else if (operation === 'cancel') {
            const postId = this.getNodeParameter('postId', i) as string;
            responseData = await apiRequest.call(this, 'DELETE', `/posts/${postId}`);
          }

          // ---- approve ----
          else if (operation === 'approve') {
            const postId = this.getNodeParameter('postId', i) as string;
            responseData = await apiRequest.call(this, 'POST', `/posts/${postId}/approve`);
          }

          // ---- requestChanges ----
          else if (operation === 'requestChanges') {
            const postId = this.getNodeParameter('postId', i) as string;
            const note = this.getNodeParameter('reviewerNote', i, '') as string;
            const body: IDataObject = {};
            if (note) body.note = note;
            responseData = await apiRequest.call(this, 'POST', `/posts/${postId}/request-changes`, body);
          }

          else {
            throw new NodeOperationError(this.getNode(), `Unknown post operation: ${operation}`, { itemIndex: i });
          }
        }

        // ------------------------------------------------------------------
        else if (resource === 'caption') {
          // ---- generate ----
          if (operation === 'generate') {
            const topic = this.getNodeParameter('topic', i, '') as string;
            const platforms = this.getNodeParameter('platforms', i, []) as string[];
            const tone = this.getNodeParameter('tone', i, 'friendly') as string;
            const maxChars = this.getNodeParameter('maxChars', i, 220) as number;
            const body: IDataObject = { tone, max_chars: maxChars };
            if (topic) body.topic = topic;
            if (platforms.length) body.platforms = platforms;
            responseData = await apiRequest.call(this, 'POST', '/ai/caption', body);
          }

          // ---- hashtags ----
          else if (operation === 'hashtags') {
            const caption = this.getNodeParameter('hashtagCaption', i, '') as string;
            const topic = this.getNodeParameter('hashtagTopic', i, '') as string;
            const platform = this.getNodeParameter('hashtagPlatform', i, '') as string;
            const count = this.getNodeParameter('hashtagCount', i, 15) as number;
            const body: IDataObject = { count };
            if (caption) body.caption = caption;
            else if (topic) body.topic = topic;
            else {
              throw new NodeOperationError(this.getNode(), 'Provide either Caption or Topic for hashtag suggestions.', { itemIndex: i });
            }
            if (platform) body.platform = platform;
            responseData = await apiRequest.call(this, 'POST', '/ai/hashtags', body);
          }

          // ---- translate ----
          else if (operation === 'translate') {
            const text = this.getNodeParameter('translateText', i) as string;
            const targetLang = this.getNodeParameter('targetLang', i) as string;
            const keepVoice = this.getNodeParameter('keepVoice', i, true) as boolean;
            responseData = await apiRequest.call(this, 'POST', '/ai/translate', {
              text,
              target_lang: targetLang,
              keep_voice: keepVoice,
            });
          }

          else {
            throw new NodeOperationError(this.getNode(), `Unknown caption operation: ${operation}`, { itemIndex: i });
          }
        }

        // ------------------------------------------------------------------
        else if (resource === 'account') {
          const res = await apiRequest.call(this, 'GET', '/accounts') as IDataObject;
          responseData = (res.accounts as IDataObject[]) ?? [];
        }

        // ------------------------------------------------------------------
        else if (resource === 'analytics') {
          const windowDays = this.getNodeParameter('windowDays', i, 30) as number;
          responseData = await apiRequest.call(this, 'GET', '/analytics', undefined, { window_days: windowDays });
        }

        // ------------------------------------------------------------------
        else if (resource === 'media') {
          const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
          const binaryItem = items[i].binary;
          if (!binaryItem?.[binaryProperty]) {
            throw new NodeOperationError(
              this.getNode(),
              `Binary property "${binaryProperty}" not found on item ${i}.`,
              { itemIndex: i },
            );
          }
          const binaryData = binaryItem[binaryProperty]!;
          const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);

          const credentials = await this.getCredentials('postMateApi');
          const baseUrl = ((credentials.baseUrl as string) ?? 'https://post-mate.com').replace(/\/$/, '');

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responseData = await (this.helpers.request as (...args: any[]) => Promise<any>)({
            method: 'POST',
            url: `${baseUrl}/api/v1/media`,
            headers: { Authorization: `Bearer ${credentials.apiKey as string}` },
            formData: {
              file: {
                value: buffer,
                options: {
                  filename: binaryData.fileName ?? 'upload',
                  contentType: binaryData.mimeType,
                },
              },
            },
            json: true,
          });
        }

        // ------------------------------------------------------------------
        else if (resource === 'webhook') {
          if (operation === 'getMany') {
            const res = await apiRequest.call(this, 'GET', '/webhooks') as IDataObject;
            responseData = (res.webhooks as IDataObject[]) ?? [];
          } else if (operation === 'create') {
            const url = this.getNodeParameter('webhookUrl', i) as string;
            const events = this.getNodeParameter('webhookEvents', i, []) as string[];
            responseData = await apiRequest.call(this, 'POST', '/webhooks', { url, events });
          } else if (operation === 'test') {
            const webhookId = this.getNodeParameter('webhookId', i) as string;
            responseData = await apiRequest.call(this, 'POST', `/webhooks/${webhookId}/test`);
          } else if (operation === 'delete') {
            const webhookId = this.getNodeParameter('webhookId', i) as string;
            responseData = await apiRequest.call(this, 'DELETE', `/webhooks/${webhookId}`);
          } else {
            throw new NodeOperationError(this.getNode(), `Unknown webhook operation: ${operation}`, { itemIndex: i });
          }
        }

        // ------------------------------------------------------------------
        else if (resource === 'metricAlert') {
          if (operation === 'getMany') {
            const res = await apiRequest.call(this, 'GET', '/metric-alerts') as IDataObject;
            responseData = (res.metric_alerts as IDataObject[]) ?? [];
          } else if (operation === 'create') {
            const metric = this.getNodeParameter('metric', i) as string;
            const threshold = this.getNodeParameter('threshold', i) as number;
            const postId = this.getNodeParameter('alertPostId', i, '') as string;
            const body: IDataObject = { metric, threshold };
            if (postId) body.post_id = postId;
            responseData = await apiRequest.call(this, 'POST', '/metric-alerts', body);
          } else if (operation === 'delete') {
            const alertId = this.getNodeParameter('alertId', i) as string;
            responseData = await apiRequest.call(this, 'DELETE', `/metric-alerts/${alertId}`);
          } else {
            throw new NodeOperationError(this.getNode(), `Unknown metricAlert operation: ${operation}`, { itemIndex: i });
          }
        }

        // ------------------------------------------------------------------
        else {
          throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, { itemIndex: i });
        }

        // Normalise to array for consistent downstream handling
        const items_out = Array.isArray(responseData) ? responseData : [responseData];
        for (const item of items_out) {
          returnData.push({ json: item as IDataObject });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
