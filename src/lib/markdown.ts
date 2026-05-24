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
	}
};

const markedInstance = new Marked();
// @ts-ignore
markedInstance.use({ renderer });

/**
 * Render markdown string to HTML with code block highlighting
 */
export function renderMarkdown(markdown: string): string {
	if (!markdown) return '';
	return markedInstance.parse(markdown) as string;
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
