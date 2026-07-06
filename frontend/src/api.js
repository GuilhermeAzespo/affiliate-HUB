const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Não autenticado');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export const api = {
  auth: {
    login: (password) => request('/auth/login', { method: 'POST', body: { password } }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
  },

  workspaces: {
    list: () => request('/workspaces'),
    get: (id) => request(`/workspaces/${id}`),
    create: (data) => request('/workspaces', { method: 'POST', body: data }),
    update: (id, data) => request(`/workspaces/${id}`, { method: 'PATCH', body: data }),
    delete: (id) => request(`/workspaces/${id}`, { method: 'DELETE' }),
  },

  whatsapp: {
    connect: (wsId) => request(`/workspaces/${wsId}/whatsapp/connect`, { method: 'POST' }),
    disconnect: (wsId) => request(`/workspaces/${wsId}/whatsapp/disconnect`, { method: 'POST' }),
    groups: (wsId) => request(`/workspaces/${wsId}/whatsapp/groups`),
  },

  groups: {
    add: (wsId, data) => request(`/workspaces/${wsId}/groups`, { method: 'POST', body: data }),
    toggle: (wsId, gid, active) => request(`/workspaces/${wsId}/groups/${gid}`, { method: 'PATCH', body: { active } }),
    remove: (wsId, gid) => request(`/workspaces/${wsId}/groups/${gid}`, { method: 'DELETE' }),
  },

  offers: {
    list: (wsId, params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/workspaces/${wsId}/offers?${qs}`);
    },
    approve: (wsId, oid) => request(`/workspaces/${wsId}/offers/${oid}/approve`, { method: 'POST' }),
    reject:  (wsId, oid) => request(`/workspaces/${wsId}/offers/${oid}/reject`,  { method: 'POST' }),
    send:    (wsId, oid) => request(`/workspaces/${wsId}/offers/${oid}/send`,    { method: 'POST' }),
  },

  platforms: {
    available: () => request('/platforms'),
    list: (wsId) => request(`/workspaces/${wsId}/platforms`),
    connect: (wsId, data) => request(`/workspaces/${wsId}/platforms`, { method: 'POST', body: data }),
    update: (wsId, pid, data) => request(`/workspaces/${wsId}/platforms/${pid}`, { method: 'PATCH', body: data }),
    remove: (wsId, pid) => request(`/workspaces/${wsId}/platforms/${pid}`, { method: 'DELETE' }),
  },
};

// WebSocket
export function createWsConnection(onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };
  return ws;
}
