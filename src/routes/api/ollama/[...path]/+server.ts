import type { RequestHandler } from './$types';

const handleProxy: RequestHandler = async ({ request, params, url }) => {
	const path = params.path;
	
	// Get target URL from headers or use default local Ollama
	const ollamaUrl = request.headers.get('x-ollama-url') || 'http://localhost:11434';
	const targetUrl = `${ollamaUrl}/${path}${url.search}`;

	// Prepare request headers
	const headers = new Headers();
	const headersToExclude = ['host', 'origin', 'referer', 'content-length', 'connection'];
	request.headers.forEach((value, key) => {
		if (!headersToExclude.includes(key.toLowerCase())) {
			headers.set(key, value);
		}
	});

	// For CORS preflight, Ollama handles it, but since we are proxying, we can set custom cors headers if needed.
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': '*'
			}
		});
	}

	// Read body if request has one
	let body: any = null;
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		body = request.body;
	}

	try {
		// Set duplex options for streaming bodies in undici/fetch
		const fetchOptions: RequestInit = {
			method: request.method,
			headers,
			body,
		};

		// If there is a body, we need to pass duplex for streaming
		if (body) {
			// @ts-ignore
			fetchOptions.duplex = 'half';
		}

		const response = await fetch(targetUrl, fetchOptions);

		// Copy response headers
		const responseHeaders = new Headers();
		response.headers.forEach((value, key) => {
			const lowerKey = key.toLowerCase();
			// Do not copy content-encoding to avoid issues with double compression.
			// Do not copy content-length or connection to let the SvelteKit runtime handle it.
			if (lowerKey !== 'content-encoding' && lowerKey !== 'content-length' && lowerKey !== 'connection') {
				responseHeaders.set(key, value);
			}
		});

		// Ensure CORS and Streaming is allowed, stable, and not buffered
		responseHeaders.set('Access-Control-Allow-Origin', '*');
		responseHeaders.set('Connection', 'keep-alive');
		responseHeaders.set('Cache-Control', 'no-cache, no-transform');
		responseHeaders.set('X-Accel-Buffering', 'no');

		return new Response(response.body, {
			status: response.status,
			headers: responseHeaders
		});
	} catch (error: any) {
		console.error('Ollama proxy error:', error);
		return new Response(JSON.stringify({ error: `Failed to connect to Ollama: ${error.message}` }), {
			status: 502, // Bad Gateway
			headers: { 
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			}
		});
	}
};

export const GET: RequestHandler = handleProxy;
export const POST: RequestHandler = handleProxy;
export const PUT: RequestHandler = handleProxy;
export const DELETE: RequestHandler = handleProxy;
export const OPTIONS: RequestHandler = handleProxy;
export const fallback: RequestHandler = handleProxy;
