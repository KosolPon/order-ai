import { Marked } from 'marked';
import Prism from 'prismjs';

// Load Prism components
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup'; // HTML/XML
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-aspnet'; // For ASPX and ASP.NET markup
import 'prismjs/components/prism-uorazor'; // For Razor template markup
import 'prismjs/components/prism-sql'; // For SQL syntax highlighting
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-go';
import 'prism-svelte';

// Custom marked renderer for syntax highlighting and copy buttons
const renderer = {
	code({ text, lang }: { text: string; lang?: string }) {
		let language = (lang || 'text').toLowerCase();
		
		// Map common aliases to Prism registered names
		const aliasMap: Record<string, string> = {
			'js': 'javascript',
			'ts': 'typescript',
			'py': 'python',
			'sh': 'bash',
			'yml': 'yaml',
			'cs': 'csharp',
			'aspx': 'aspnet',
			'razor': 'aspnet', // Fallback to aspnet which matches razor syntax well
			'kt': 'kotlin',
			'golang': 'go'
		};

		if (aliasMap[language]) {
			language = aliasMap[language];
		}

		if (language === 'mermaid') {
			const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
			const escapedCode = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
				
			return `<div class="mermaid-block-wrapper" id="wrapper-${id}">
				<div class="mermaid-block-header">
					<div class="mermaid-tabs">
						<button class="mermaid-tab active" onclick="window.switchMermaidTab('${id}', 'preview')">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px; display: inline-block;">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm0-4h-2V7h2v2z"/>
							</svg>
							Flowchart
						</button>
						<button class="mermaid-tab" onclick="window.switchMermaidTab('${id}', 'code')">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px; display: inline-block;">
								<path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
							</svg>
							Code
						</button>
					</div>
					<div class="mermaid-block-actions">
						<button class="mermaid-action-btn zoom-btn" id="zoom-btn-${id}" onclick="window.zoomMermaid('${id}')">
							<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 2px; display: inline-block;">
								<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
							</svg>
							Fullscreen
						</button>
						<button class="copy-btn" onclick="window.copyToClipboard('${id}')" data-code-id="${id}">
							<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 2px; display: inline-block;">
								<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
							</svg>
							Copy Code
						</button>
					</div>
				</div>
				<div class="mermaid-preview-container" id="container-${id}">
					<div class="mermaid-loading">
						<div class="spinner-glow small"></div>
						<span>Rendering flowchart...</span>
					</div>
				</div>
				<div class="mermaid-code-container hidden" id="code-container-${id}">
					<pre class="language-text"><code class="language-text">${escapedCode}</code></pre>
				</div>
				<template id="${id}">${encodeURIComponent(text)}</template>
			</div>`;
		}

		if (aliasMap[language]) {
			language = aliasMap[language];
		}

		let highlighted = text;
		
		if (Prism.languages[language]) {
			try {
				highlighted = Prism.highlight(text, Prism.languages[language], language);
			} catch (e) {
				console.warn('Prism highlighting error:', e);
			}
		} else {
			// Escape html
			highlighted = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}

		const id = `code-${Math.random().toString(36).slice(2, 11)}`;

		return `<div class="code-block-wrapper">
			<div class="code-block-header">
				<span>${lang || 'text'}</span>
				<button class="copy-btn" onclick="window.copyToClipboard('${id}')" data-code-id="${id}">
					<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
						<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
					</svg>
					Copy
				</button>
			</div>
			<pre class="language-${language}"><code class="language-${language}">${highlighted}</code></pre>
			<template id="${id}">${encodeURIComponent(text)}</template>
		</div>`;
	},
	table(this: any, token: any) {
		let headerCells = '';
		for (let i = 0; i < token.header.length; i++) {
			headerCells += this.tablecell(token.header[i]);
		}
		const headerHtml = this.tablerow({ text: headerCells });

		let bodyRows = '';
		for (let i = 0; i < token.rows.length; i++) {
			let rowCells = '';
			const row = token.rows[i];
			for (let j = 0; j < row.length; j++) {
				rowCells += this.tablecell(row[j]);
			}
			bodyRows += this.tablerow({ text: rowCells });
		}
		
		const tbodyHtml = bodyRows ? `<tbody>${bodyRows}</tbody>` : '';
		const tableHtml = `<table>
<thead>
${headerHtml}</thead>
${tbodyHtml}</table>`;

		// Generate TSV string
		const escapeTsvCell = (text: string) => {
			let escaped = text;
			if (/[\"\t\n\r]/.test(escaped)) {
				escaped = '"' + escaped.replace(/"/g, '""') + '"';
			}
			return escaped;
		};

		const tsvRows: string[] = [];
		
		// Header row
		const headerRow = token.header.map((cell: any) => escapeTsvCell(cell.text)).join('\t');
		tsvRows.push(headerRow);
		
		// Body rows
		for (const row of token.rows) {
			const rowStr = row.map((cell: any) => escapeTsvCell(cell.text)).join('\t');
			tsvRows.push(rowStr);
		}
		
		const tsvString = tsvRows.join('\n');
		const id = `table-${Math.random().toString(36).slice(2, 11)}`;

		return `<div class="table-block-wrapper">
			<div class="table-block-header">
				<span class="table-block-title">
					<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px; display: inline-block;">
						<path d="M10 10.02h5V21h-5V10.02zM17 21h3c1.1 0 2-.9 2-2v-9h-5v11zm3-18H5c-1.1 0-2 .9-2 2v3h19V5c0-1.1-.9-2-2-2zM3 19c0 1.1.9 2 2 2h3V10H3v9zm5-9H5v9H3v-9h5z"/>
					</svg>
					Table
				</span>
				<button class="copy-table-btn" onclick="window.copyTableToClipboard('${id}')" data-table-id="${id}">
					<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
						<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
					</svg>
					Copy Table
				</button>
			</div>
			<div class="table-scroll-container" id="table-container-${id}">
				${tableHtml}
			</div>
			<template id="tsv-${id}">${encodeURIComponent(tsvString)}</template>
		</div>`;
	},
	image(this: any, token: any) {
		const href = token.href || '';
		const text = token.text || '';
		const title = token.title || '';
		
		const type = getMediaType(href) || 'image';
		
		if (type === 'audio') {
			return renderAudioPlayer(href, text);
		} else if (type === 'video') {
			return renderVideoPlayer(href, text);
		} else {
			return renderImageElement(href, text, title);
		}
	},
	link(this: any, token: any) {
		const href = token.href || '';
		const text = token.text || '';
		const title = token.title || '';
		
		const type = getMediaType(href);
		
		if (type === 'image') {
			return renderImageElement(href, text, title);
		} else if (type === 'audio') {
			return renderAudioPlayer(href, text);
		} else if (type === 'video') {
			return renderVideoPlayer(href, text);
		}
		
		const titleAttr = title ? ` title="${title}"` : '';
		return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
	}
};

function getMediaType(url: string): 'image' | 'audio' | 'video' | null {
	if (!url) return null;
	
	if (url.startsWith('data:')) {
		if (url.startsWith('data:image/')) return 'image';
		if (url.startsWith('data:audio/')) return 'audio';
		if (url.startsWith('data:video/')) return 'video';
	}
	
	const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
	
	const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico'];
	const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus'];
	const videoExtensions = ['.mp4', '.webm', '.ogv', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.3gp'];
	
	if (imageExtensions.some(ext => cleanUrl.endsWith(ext))) {
		return 'image';
	}
	if (audioExtensions.some(ext => cleanUrl.endsWith(ext))) {
		return 'audio';
	}
	if (videoExtensions.some(ext => cleanUrl.endsWith(ext))) {
		return 'video';
	}
	
	return null;
}

function renderImageElement(href: string, alt: string, title: string): string {
	const titleAttr = title ? ` title="${title}"` : '';
	const altText = alt || 'AI Generated Image';
	const encodedAlt = encodeURIComponent(altText);
	return `<div class="media-image-wrapper">
		<img src="${href}" alt="${altText}"${titleAttr} class="media-image-preview" onclick="window.showMediaLightbox(this.src, '${encodedAlt}')"/>
		<div class="media-image-overlay">
			<span class="media-image-name">${altText}</span>
			<button class="media-btn media-expand-btn" onclick="window.showMediaLightbox('${href}', '${encodedAlt}')" title="Zoom image">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
					<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
				</svg>
			</button>
		</div>
	</div>`;
}

function renderAudioPlayer(href: string, title: string): string {
	const cleanTitle = title || 'Audio Output';
	return `<div class="media-audio-wrapper">
		<div class="media-audio-card">
			<div class="media-audio-header">
				<div class="media-audio-icon">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
					</svg>
				</div>
				<div class="media-audio-details">
					<span class="media-audio-title" title="${cleanTitle}">${cleanTitle}</span>
					<span class="media-audio-subtitle">Audio Player</span>
				</div>
			</div>
			<div class="media-audio-controls-container">
				<audio controls src="${href}" class="media-audio-element" preload="metadata"></audio>
			</div>
		</div>
	</div>`;
}

function renderVideoPlayer(href: string, title: string): string {
	const cleanTitle = title || 'Video Output';
	return `<div class="media-video-wrapper">
		<div class="media-video-card">
			<div class="media-video-header">
				<div class="media-video-icon">
					<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
						<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 16H5V8h9v8z"/>
					</svg>
				</div>
				<span class="media-video-title" title="${cleanTitle}">${cleanTitle}</span>
			</div>
			<div class="media-video-content">
				<video controls class="media-video-element" preload="metadata">
					<source src="${href}">
					Your browser does not support the video tag.
				</video>
			</div>
		</div>
	</div>`;
}

function cleanCodeFences(text: string): string {
	let cleaned = text.trim();
	if (cleaned.startsWith('```')) {
		const firstLineEnd = cleaned.indexOf('\n');
		if (firstLineEnd !== -1) {
			cleaned = cleaned.substring(firstLineEnd + 1);
		} else {
			cleaned = '';
		}
	}
	if (cleaned.endsWith('```')) {
		cleaned = cleaned.substring(0, cleaned.length - 3).trim();
	}
	return cleaned;
}

function preprocessCanvasTags(text: string): string {
	if (!text) return '';
	
	let processed = text;
	
	// 1. Handle fully closed tags
	processed = processed.replace(/<canvas\s+name="([^"]+)"(?:\s+type="([^"]+)")?>([\s\S]*?)<\/canvas>/gi, (match, name, type, content) => {
		const cleanName = name.replace(/'/g, "\\'");
		
		// Determine language/type for formatting in chat
		let lang = (type || '').toLowerCase().trim();
		if (!lang) {
			const lowerName = name.toLowerCase();
			if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
				lang = 'html';
			} else if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
				lang = 'markdown';
			} else if (lowerName.endsWith('.js') || lowerName.endsWith('.jsx')) {
				lang = 'javascript';
			} else if (lowerName.endsWith('.ts') || lowerName.endsWith('.tsx')) {
				lang = 'typescript';
			} else if (lowerName.endsWith('.svelte')) {
				lang = 'svelte';
			} else if (lowerName.endsWith('.py')) {
				lang = 'python';
			} else if (lowerName.endsWith('.css')) {
				lang = 'css';
			} else if (lowerName.endsWith('.json')) {
				lang = 'json';
			} else if (lowerName.endsWith('.sh') || lowerName.endsWith('.bash')) {
				lang = 'bash';
			} else if (lowerName.endsWith('.sql')) {
				lang = 'sql';
			} else {
				lang = 'code';
			}
		}

		let renderedContent = '';
		if (lang === 'markdown') {
			renderedContent = `\n\n${content}\n\n`;
		} else {
			const cleanContent = cleanCodeFences(content);
			renderedContent = `\n\n\`\`\`${lang === 'code' ? '' : lang}\n${cleanContent}\n\`\`\`\n\n`;
		}

		return `\n\n<div class="canvas-artifact-card" data-file-name="${cleanName}" onclick="window.openCanvasFile('${cleanName}')" role="button" tabindex="0">
			<div class="artifact-card-icon">
				<svg viewBox="0 0 24 24" width="20" height="20">
					<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
				</svg>
			</div>
			<div class="artifact-card-info">
				<div class="artifact-card-title">${name}</div>
				<div class="artifact-card-meta">Click to open interactive view</div>
			</div>
			<div class="artifact-card-action">
				Open Canvas ↗
			</div>
		</div>\n\n${renderedContent}`;
	});
 
	// 2. Handle unclosed tags at the end of the text (streaming)
	processed = processed.replace(/<canvas\s+name="([^"]+)"(?:\s+type="([^"]+)")?>([\s\S]*?)$/gi, (match, name, type, content) => {
		const cleanName = name.replace(/'/g, "\\'");
		
		let lang = (type || '').toLowerCase().trim();
		if (!lang) {
			const lowerName = name.toLowerCase();
			if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
				lang = 'html';
			} else if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
				lang = 'markdown';
			} else if (lowerName.endsWith('.js') || lowerName.endsWith('.jsx')) {
				lang = 'javascript';
			} else if (lowerName.endsWith('.ts') || lowerName.endsWith('.tsx')) {
				lang = 'typescript';
			} else if (lowerName.endsWith('.svelte')) {
				lang = 'svelte';
			} else if (lowerName.endsWith('.py')) {
				lang = 'python';
			} else if (lowerName.endsWith('.css')) {
				lang = 'css';
			} else if (lowerName.endsWith('.json')) {
				lang = 'json';
			} else if (lowerName.endsWith('.sh') || lowerName.endsWith('.bash')) {
				lang = 'bash';
			} else if (lowerName.endsWith('.sql')) {
				lang = 'sql';
			} else {
				lang = 'code';
			}
		}

		let renderedContent = '';
		if (lang === 'markdown') {
			renderedContent = `\n\n${content}\n\n`;
		} else {
			const cleanContent = cleanCodeFences(content);
			renderedContent = `\n\n\`\`\`${lang === 'code' ? '' : lang}\n${cleanContent}\n\`\`\`\n\n`;
		}

		return `\n\n<div class="canvas-artifact-card processing" data-file-name="${cleanName}" onclick="window.openCanvasFile('${cleanName}')" role="button" tabindex="0">
			<div class="artifact-card-icon animate-pulse">
				<svg viewBox="0 0 24 24" width="20" height="20">
					<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
				</svg>
			</div>
			<div class="artifact-card-info">
				<div class="artifact-card-title">${name}</div>
				<div class="artifact-card-meta">Writing file... (Click to view)</div>
			</div>
			<div class="artifact-card-action">
				<div class="typing-indicator small-indicator"><span></span><span></span><span></span></div>
			</div>
		</div>\n\n${renderedContent}`;
	});
 
	return processed;
}

const markedInstance = new Marked();
// @ts-ignore
markedInstance.use({ renderer });

function replaceArrowSymbols(text: string): string {
	if (!text) return '';
	
	// Split by code blocks and inline code to avoid replacing symbols inside code
	const parts = text.split(/(```[\s\S]*?```|`[^`\n]*?`)/g);
	for (let i = 0; i < parts.length; i++) {
		// Even indexes are outside of code blocks/inline code
		if (i % 2 === 0) {
			parts[i] = parts[i]
				// Math/LaTeX Arrow Replacements (with $...$ wrapping ONLY)
				.replace(/\$\\(long)?rightarrows?\$/gi, '→')
				.replace(/\$\\to\$/gi, '→')
				.replace(/\$\\(long)?leftarrows?\$/gi, '←')
				.replace(/\$\\gets\$/gi, '←')
				.replace(/\$\\(long)?leftrightarrows?\$/gi, '↔')
				.replace(/\$\\(long)?Rightarrows?\$/gi, '⇒')
				.replace(/\$\\(long)?Leftarrows?\$/gi, '⇐')
				.replace(/\$\\(long)?Leftrightarrows?\$/gi, '⇔')
				.replace(/\$\\uparrow\$/gi, '↑')
				.replace(/\$\\downarrow\$/gi, '↓')
				.replace(/\$\\updownarrow\$/gi, '↕');
		}
	}
	return parts.join('');
}

const markdownCache = new Map<string, string>();

/**
 * Render markdown string to HTML with code block highlighting
 */
export function renderMarkdown(markdown: string): string {
	if (!markdown) return '';
	
	const cached = markdownCache.get(markdown);
	if (cached) return cached;

	const arrowProcessed = replaceArrowSymbols(markdown);
	const preprocessed = preprocessCanvasTags(arrowProcessed);
	const rendered = markedInstance.parse(preprocessed) as string;

	// Limit cache size to 500 entries to prevent memory leaks
	if (markdownCache.size > 500) {
		const firstKey = markdownCache.keys().next().value;
		if (firstKey !== undefined) {
			markdownCache.delete(firstKey);
		}
	}

	markdownCache.set(markdown, rendered);
	return rendered;
}

// Bind helper globally for code block copy buttons
if (typeof window !== 'undefined') {
	(window as any).copyToClipboard = (id: string) => {
		const template = document.getElementById(id) as HTMLTemplateElement;
		if (!template) return;
		const code = decodeURIComponent(template.innerHTML);
		navigator.clipboard.writeText(code).then(() => {
			const btn = document.querySelector(`[data-code-id="${id}"]`);
			if (btn) {
				const originalHtml = btn.innerHTML;
				btn.innerHTML = `
					<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
						<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
					</svg>
					Copied!
				`;
				btn.classList.add('copied');
				setTimeout(() => {
					btn.innerHTML = originalHtml;
					btn.classList.remove('copied');
				}, 2000);
			}
		});
	};

	(window as any).copyTableToClipboard = (id: string) => {
		const tsvTemplate = document.getElementById(`tsv-${id}`) as HTMLTemplateElement;
		const tableContainer = document.getElementById(`table-container-${id}`);
		if (!tsvTemplate || !tableContainer) return;

		const tsvText = decodeURIComponent(tsvTemplate.innerHTML);
		const htmlText = tableContainer.innerHTML;

		// Create blobs for clipboard
		const clipboardData: Record<string, Blob> = {
			'text/plain': new Blob([tsvText], { type: 'text/plain' })
		};

		try {
			clipboardData['text/html'] = new Blob([htmlText], { type: 'text/html' });
		} catch (e) {
			console.warn('Could not create HTML blob for clipboard', e);
		}

		const btn = document.querySelector(`[data-table-id="${id}"]`);
		const updateButton = (success: boolean) => {
			if (btn) {
				const originalHtml = btn.innerHTML;
				btn.innerHTML = success ? `
					<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
						<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
					</svg>
					Copied!
				` : `Failed!`;
				btn.classList.add('copied');
				setTimeout(() => {
					btn.innerHTML = originalHtml;
					btn.classList.remove('copied');
				}, 2000);
			}
		};

		if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
			navigator.clipboard.write([
				new ClipboardItem(clipboardData)
			]).then(() => {
				updateButton(true);
			}).catch(err => {
				console.error('ClipboardItem write failed, falling back to writeText:', err);
				navigator.clipboard.writeText(tsvText)
					.then(() => updateButton(true))
					.catch(() => updateButton(false));
			});
		} else {
			navigator.clipboard.writeText(tsvText)
				.then(() => updateButton(true))
				.catch(() => updateButton(false));
		}
	};
}

export interface ParsedThinking {
	thinking: string;
	response: string;
	isThinking: boolean;
}

/**
 * Parses response content to extract <think>...</think> block.
 * Handles cases where the tag is still open (actively streaming).
 */
export function parseThinking(content: string): ParsedThinking {
	if (!content) {
		return { thinking: '', response: '', isThinking: false };
	}

	const trimmed = content.trim();
	// Check if the content starts with '<think>' or is a prefix of '<think>' (to support streaming start)
	const isThinkBlock = trimmed.startsWith('<think>') || ('<think>'.startsWith(trimmed) && trimmed.length > 0);

	if (!isThinkBlock) {
		return { thinking: '', response: content, isThinking: false };
	}

	let thinkingParts: string[] = [];
	let responseParts: string[] = [];
	let isThinking = false;
	
	let remaining = content;
	while (remaining.length > 0) {
		const thinkStart = remaining.indexOf('<think>');
		if (thinkStart === -1) {
			responseParts.push(remaining);
			break;
		}
		
		// Add text before <think> to response
		if (thinkStart > 0) {
			responseParts.push(remaining.slice(0, thinkStart));
		}
		
		const thinkEnd = remaining.indexOf('</think>', thinkStart);
		if (thinkEnd === -1) {
			thinkingParts.push(remaining.slice(thinkStart + 7));
			isThinking = true;
			break;
		}
		
		thinkingParts.push(remaining.slice(thinkStart + 7, thinkEnd));
		remaining = remaining.slice(thinkEnd + 8);
	}

	return {
		thinking: thinkingParts.filter(p => p.trim()).join('\n\n'),
		response: responseParts.join(''),
		isThinking
	};
}

