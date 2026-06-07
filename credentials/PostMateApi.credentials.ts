import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class PostMateApi implements ICredentialType {
  name = 'postMateApi';
  displayName = 'Post Mate API';
  documentationUrl = 'https://docs.post-mate.com/api/authentication';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      placeholder: 'pm_live_…',
      description:
        'Full-scope REST API key. Create one under Settings → API in the post mate dashboard.',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://post-mate.com',
      description:
        'Override for self-hosted deployments. Leave as-is for post-mate.com cloud.',
    },
  ];

  /**
   * Applied automatically by n8n when the credential is used in
   * httpRequestWithAuthentication calls — adds Bearer header.
   */
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.apiKey}}',
      },
    },
  };

  /**
   * Quick connectivity test — GET /api/v1/accounts returns 200 with a
   * valid key and 401/403 otherwise.
   */
  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '/api/v1/accounts',
    },
  };
}
