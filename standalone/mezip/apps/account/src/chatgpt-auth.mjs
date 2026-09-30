const reservedPaths = new Set(['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'])

function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  try {
    const url = new URL(value, 'https://app.local')
    if (url.origin !== 'https://app.local' || reservedPaths.has(url.pathname)) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/' }
}

// These routes belong to the Sites dispatcher. Navigate with a top-level anchor.
export const chatGPTSignInPath = (returnTo = '/?auth=changed') =>
  `/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`
export const chatGPTSignOutPath = (returnTo = '/?auth=changed#login') =>
  `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`
