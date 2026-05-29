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

		// Create a custom ReadableStream to relay the response body chunk-by-chunk.
		// This avoids piping bugs in Node/Bun fetch implementation when handling network streams.
		let heartbeatInterval: any;
		let isControllerClosed = false;
		const stream = new ReadableStream({
			async start(controller) {
				const reader = response.body?.getReader();
				if (!reader) {
					controller.close();
					isControllerClosed = true;
					return;
				}

				const encoder = new TextEncoder();

				// Start a keep-alive heartbeat interval (every 15 seconds)
				// to prevent Cloudflare, Nginx, or Vite dev server timeouts over network routes.
				heartbeatInterval = setInterval(() => {
					try {
						if (!isControllerClosed) {
							controller.enqueue(encoder.encode('\n'));
						}
					} catch (e) {
						clearInterval(heartbeatInterval);
					}
				}, 15000);

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}
						if (!isControllerClosed) {
							controller.enqueue(value);
						}
					}
				} catch (err) {
					if (!isControllerClosed) {
						console.error('Error proxying Ollama stream chunk:', err);
						try {
							controller.error(err);
						} catch (e) {}
					}
				} finally {
					if (heartbeatInterval) {
						clearInterval(heartbeatInterval);
					}
					if (!isControllerClosed) {
						try {
							controller.close();
						} catch (e) {}
						isControllerClosed = true;
					}
				}
			},
			cancel() {
				isControllerClosed = true;
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
				}
			}
		});

		return new Response(stream, {
			status: response.status,
			headers: responseHeaders
		});
	} catch (error: any) {
		const cause = error.cause;
		const errorCode = cause?.code || error.code;
		const errorMsg = cause?.message || error.message;

		if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND') {
			console.error(`[Ollama Proxy Error] Connection failed (${errorCode}) to ${targetUrl}: ${errorMsg}`);
		} else {
			console.error('Ollama proxy error:', error);
		}

		return new Response(JSON.stringify({ error: `Failed to connect to Ollama: ${errorMsg}` }), {
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
