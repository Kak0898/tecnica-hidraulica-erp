type AssetsBinding = {
  fetch(request: Request): Promise<Response>
}

type Env = {
  ASSETS: AssetsBinding
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || request.method !== 'GET') return response

    const acceptsHtml = request.headers.get('accept')?.includes('text/html')
    if (!acceptsHtml) return response

    const url = new URL('/index.html', request.url)
    return env.ASSETS.fetch(new Request(url, request))
  },
}
