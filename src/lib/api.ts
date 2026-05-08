const URLS = {
  auth: 'https://functions.poehali.dev/4edb0e01-caa0-47b6-a850-24edeed03951',
  apiKeys: 'https://functions.poehali.dev/3414af91-030c-4d14-acf9-1a2894a13352',
  proxy: 'https://functions.poehali.dev/db4455a3-fb31-4d3d-9fa5-4067e71d38b2',
  usage: 'https://functions.poehali.dev/61911c03-a7fa-46df-b022-c3caf86940bd',
}

function getAuthHeaders() {
  const user = JSON.parse(localStorage.getItem('deway_user') || '{}')
  return {
    'Content-Type': 'application/json',
    'X-User-Id': user.id?.toString() || '',
    'X-User-Role': user.role || 'user',
  }
}

export const authApi = {
  register: (email: string, password: string) =>
    fetch(`${URLS.auth}?action=register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(r => r.json()),
  login: (email: string, password: string) =>
    fetch(`${URLS.auth}?action=login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(r => r.json()),
  me: () =>
    fetch(`${URLS.auth}?action=me`, { headers: getAuthHeaders() }).then(r => r.json()),
}

export const keysApi = {
  list: () =>
    fetch(`${URLS.apiKeys}?action=list`, { headers: getAuthHeaders() }).then(r => r.json()),
  create: (data: { name: string; quota_tokens?: number; rate_limit_rpm?: number; allowed_models?: string[] }) =>
    fetch(`${URLS.apiKeys}?action=create`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) }).then(r => r.json()),
  revoke: (id: number) =>
    fetch(`${URLS.apiKeys}?action=revoke&id=${id}`, { method: 'POST', headers: getAuthHeaders() }).then(r => r.json()),
  update: (id: number, data: object) =>
    fetch(`${URLS.apiKeys}?action=update&id=${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(data) }).then(r => r.json()),
}

export const usageApi = {
  summary: (days = 30) =>
    fetch(`${URLS.usage}?action=summary&days=${days}`, { headers: getAuthHeaders() }).then(r => r.json()),
  byDay: (days = 30) =>
    fetch(`${URLS.usage}?action=by-day&days=${days}`, { headers: getAuthHeaders() }).then(r => r.json()),
  byModel: (days = 30) =>
    fetch(`${URLS.usage}?action=by-model&days=${days}`, { headers: getAuthHeaders() }).then(r => r.json()),
  byKey: (days = 30) =>
    fetch(`${URLS.usage}?action=by-key&days=${days}`, { headers: getAuthHeaders() }).then(r => r.json()),
  logs: (limit = 50) =>
    fetch(`${URLS.usage}?action=logs&limit=${limit}`, { headers: getAuthHeaders() }).then(r => r.json()),
  adminUsers: () =>
    fetch(`${URLS.usage}?action=admin-users`, { headers: getAuthHeaders() }).then(r => r.json()),
}

export const proxyApi = {
  models: () =>
    fetch(`${URLS.proxy}?action=models`).then(r => r.json()),
}
