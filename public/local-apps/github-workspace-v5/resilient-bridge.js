(() => {
  const API_ROOT = '/v1/github-workspace';
  const OPTIONAL_GETS = [
    `${API_ROOT}/snippets`,
    `${API_ROOT}/issues`,
    `${API_ROOT}/pull-requests`,
    `${API_ROOT}/tasks`,
    `${API_ROOT}/activity`,
  ];
  const statuses = (window.__mezipWorkspaceEndpointStatus = {});
  const nativeFetch = window.fetch.bind(window);

  const endpointKey = (input) => {
    const raw = typeof input === 'string' ? input : input?.url;
    if (!raw) return '';
    try {
      return new URL(raw, location.href).pathname;
    } catch {
      return String(raw).split('?')[0];
    }
  };

  const isOptional = (path, method) =>
    method === 'GET' &&
    OPTIONAL_GETS.some((prefix) => path === prefix || path.startsWith(`${prefix}?`));

  const emptyResponse = () =>
    new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-MEZIP-Partial': 'true' },
    });

  window.fetch = async (input, init = {}) => {
    const path = endpointKey(input);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    try {
      const response = await nativeFetch(input, init);
      if (response.ok || !isOptional(path, method)) return response;
      statuses[path] = { state: 'ERROR', status: response.status };
      return emptyResponse();
    } catch (error) {
      if (!isOptional(path, method)) throw error;
      statuses[path] = {
        state: 'ERROR',
        status: 0,
        message: error instanceof Error ? error.message : '网络错误',
      };
      return emptyResponse();
    }
  };
})();
