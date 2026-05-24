import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) {
		return json({ error: 'Missing url parameter' }, { status: 400 });
	}

	try {
		const res = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			}
		});

		if (!res.ok) {
			return json({ error: `Failed to fetch URL: HTTP ${res.status}` }, { status: 400 });
		}

		const html = await res.text();
		
		// Basic HTML-to-text parser:
		// Remove script and style tags
		let text = html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

		// Strip all other HTML tags
		text = text.replace(/<[^>]+>/g, ' ');

		// Decode common HTML entities
		text = text
			.replace(/&nbsp;/g, ' ')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");

		// Collapse whitespace and trim
		text = text.replace(/\s+/g, ' ').trim();

		// Limit the response length to avoid token explosion (max 50k characters)
		if (text.length > 50000) {
			text = text.substring(0, 50000) + '... [content truncated]';
		}

		return json({ text });
	} catch (err: any) {
		console.error('Error in scrape endpoint:', err);
		return json({ error: err.message || 'Error fetching URL' }, { status: 500 });
	}
};
