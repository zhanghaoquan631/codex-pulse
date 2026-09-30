(() => {
  const originalFetch = window.fetch.bind(window);
  const isWorkspaceRequest = (input) => {
    try {
      return new URL(typeof input === 'string' ? input : input.url, location.href)
        .pathname.startsWith('/v1/github-workspace/');
    } catch {
      return false;
    }
  };

  const requestMethod = (input, init) =>
    String(init?.method || (typeof input === 'string' ? 'GET' : input.method || 'GET')).toUpperCase();

  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  const isConnectionRequest = (input) => {
    try {
      return (
        new URL(typeof input === 'string' ? input : input.url, location.href)
          .pathname === '/v1/github-workspace/connection'
      );
    } catch {
      return false;
    }
  };

  window.fetch = async (input, init) => {
    const canRetry = isWorkspaceRequest(input) && requestMethod(input, init) === 'GET';
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await originalFetch(input, init);
        if (canRetry && attempt < 8 && [500, 502, 503].includes(response.status)) {
          await wait(1000);
          continue;
        }
      if (
        isConnectionRequest(input) &&
        (response.status === 401 || response.status === 403)
      ) {
        window.__mezipGitHubConnectionState = 'AUTH_REQUIRED';
        return new Response(
          JSON.stringify({ status: 'DISCONNECTED', code: 'AUTH_REQUIRED' }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
              'X-MEZIP-Connection-State': 'DISCONNECTED',
            },
          },
        );
      }
      return response;
      } catch (error) {
        if (canRetry && attempt < 8) {
          await wait(1000);
          continue;
        }
        if (isConnectionRequest(input))
          window.__mezipGitHubConnectionState = 'NETWORK_ERROR';
        throw error;
      }
    }
  };
})();
