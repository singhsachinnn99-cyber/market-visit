import { AuditLog } from '@/types';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export const getGraphToken = async (): Promise<string> => {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Graph credentials are not configured in environment variables');
  }

  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to acquire Graph token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken!;
};

export const graphFetch = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  const siteId = process.env.GRAPH_SITE_ID;
  if (!siteId) {
    throw new Error('SharePoint Site ID is not configured');
  }

  const token = await getGraphToken();
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://graph.microsoft.com/v1.0/sites/${siteId}/${endpoint}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph API error on ${url}: ${response.status} ${response.statusText} - ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const getListItems = async (listName: string, query = ''): Promise<any[]> => {
  const url = `lists/${listName}/items?expand=fields${query}`;
  const response = await graphFetch(url);
  return response.value || [];
};

export const createListItem = async (listName: string, fields: Record<string, any>): Promise<any> => {
  const url = `lists/${listName}/items`;
  return graphFetch(url, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
};

export const updateListItem = async (listName: string, itemId: string, fields: Record<string, any>): Promise<any> => {
  const url = `lists/${listName}/items/${itemId}/fields`;
  return graphFetch(url, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
};

export const deleteListItem = async (listName: string, itemId: string): Promise<void> => {
  const url = `lists/${listName}/items/${itemId}`;
  await graphFetch(url, {
    method: 'DELETE',
  });
};
