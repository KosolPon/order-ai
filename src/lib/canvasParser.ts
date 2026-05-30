export interface ExtractedCanvasFile {
	name: string;
	type: 'html' | 'markdown' | 'code' | 'text';
	content: string;
}

export interface CanvasPatch {
	name: string;
	search: string;
	replace: string;
}

/**
 * Extracts and parses <canvas name="...">...</canvas> tags from a string.
 * This runs on streaming message chunks or full completed responses.
 */
export function parseCanvasTags(text: string): ExtractedCanvasFile[] {
	if (!text) return [];

	const files: ExtractedCanvasFile[] = [];
	// Regular expression to match <canvas name="filename" type="type">content</canvas> or <canvas name="filename">content</canvas>
	// Handles missing closing tags gracefully for streaming support
	const canvasRegex = /<canvas\s+name="([^"]+)"(?:\s+type="([^"]+)")?>([\s\S]*?)(?:<\/canvas>|$)/gi;

	let match;
	while ((match = canvasRegex.exec(text)) !== null) {
		const name = match[1]?.trim();
		if (!name) continue;

		let type = (match[2] || '').toLowerCase().trim() as any;
		let content = match[3] || '';

		// Clean up content: strip outer markdown code fences if AI added them
		content = cleanCodeFences(content);

		// Auto-detect type if not specified
		if (!type) {
			const lowerName = name.toLowerCase();
			if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
				type = 'html';
			} else if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
				type = 'markdown';
			} else if (lowerName.endsWith('.txt')) {
				type = 'text';
			} else {
				type = 'code';
			}
		} else if (type !== 'html' && type !== 'markdown' && type !== 'code' && type !== 'text') {
			// Normalize generic types
			type = 'code';
		}

		// Avoid adding files with empty content if it's still streaming/empty
		files.push({ name, type, content });
	}

	return files;
}

/**
 * Extracts and parses <canvas-patch name="..."><search>...</search><replace>...</replace></canvas-patch> tags.
 * Used for targeted search & replace operations on existing files.
 */
export function parseCanvasPatchTags(text: string): CanvasPatch[] {
	if (!text) return [];

	const patches: CanvasPatch[] = [];
	const patchRegex = /<canvas-patch\s+name="([^"]+)">([\s\S]*?)(?:<\/canvas-patch>|$)/gi;

	let match;
	while ((match = patchRegex.exec(text)) !== null) {
		const name = match[1]?.trim();
		const body = match[2] || '';
		if (!name || !body) continue;

		const searchMatch = /<search>([\s\S]*?)<\/search>/i.exec(body);
		const replaceMatch = /<replace>([\s\S]*?)<\/replace>/i.exec(body);

		if (!searchMatch) continue;

		const search = searchMatch[1] ?? '';
		const replace = replaceMatch ? replaceMatch[1] : '';

		patches.push({ name, search, replace });
	}

	return patches;
}

/**
 * Strips formatting fences like ```html ... ``` that LLMs often generate inside canvas tags.
 */
function cleanCodeFences(text: string): string {
	let cleaned = text.trim();
	
	// Strip starting code block
	if (cleaned.startsWith('```')) {
		const firstLineEnd = cleaned.indexOf('\n');
		if (firstLineEnd !== -1) {
			cleaned = cleaned.substring(firstLineEnd + 1);
		} else {
			cleaned = ''; // just ```
		}
	}
	
	// Strip ending code block
	if (cleaned.endsWith('```')) {
		cleaned = cleaned.substring(0, cleaned.length - 3).trim();
	}
	
	return cleaned;
}
