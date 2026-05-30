<script lang="ts">
	import { db, type CanvasFile } from '$lib/db';
	import { renderMarkdown } from '$lib/markdown';
	import { liveQuery } from 'dexie';
	
	// Import Prism and languages in correct order to enable markup inline styles
	import Prism from 'prismjs';
	import 'prismjs/components/prism-javascript';
	import 'prismjs/components/prism-css';
	import 'prismjs/components/prism-markup';
	import 'prismjs/components/prism-typescript';
	import 'prismjs/components/prism-python';
	import 'prismjs/components/prism-bash';
	import 'prismjs/components/prism-json';

	let {
		chatId,
		activeFileName = null,
		onChangeActiveFile
	} = $props<{
		chatId: string;
		activeFileName: string | null;
		onChangeActiveFile: (name: string | null) => void;
	}>();

	// Reactive Canvas files list for the current chatId
	let files = $state<CanvasFile[]>([]);
	$effect(() => {
		if (!chatId) {
			files = [];
			return;
		}
		const subscription = liveQuery(() => db.canvasFiles.where({ chatId }).toArray()).subscribe((val) => {
			files = val;
		});
		return () => subscription.unsubscribe();
	});

	// Derived: active file based on activeFileName prop, fallback to first file
	const activeFile = $derived.by(() => {
		if (files.length === 0) return null;
		if (activeFileName) {
			const found = files.find((f) => f.name === activeFileName);
			if (found) return found;
		}
		return files[0];
	});

	// Derived: active file has preview capability
	const hasPreview = $derived(activeFile ? (activeFile.type === 'html' || activeFile.type === 'markdown') : false);

	// Update the parent state if the active file falls back or changes
	$effect(() => {
		if (activeFile && activeFile.name !== activeFileName) {
			onChangeActiveFile(activeFile.name);
		} else if (files.length === 0 && activeFileName !== null) {
			onChangeActiveFile(null);
		}
	});

	// Editor tab states: default to 'preview' if supported, else 'code'
	let activeTab = $state<'code' | 'preview'>('preview');
	let editorContent = $state('');

	// References for overlay editor scroll syncing
	let preElement = $state<HTMLPreElement | null>(null);
	let textareaElement = $state<HTMLTextAreaElement | null>(null);

	function syncScroll() {
		if (preElement && textareaElement) {
			preElement.scrollTop = textareaElement.scrollTop;
			preElement.scrollLeft = textareaElement.scrollLeft;
		}
	}

	// Initialize activeTab from localStorage on mount
	$effect(() => {
		const storedTab = localStorage.getItem('canvas_active_tab');
		if (storedTab === 'code' || storedTab === 'preview') {
			activeTab = storedTab;
		}
	});

	// Automatically adjust tab when the active file changes, respecting user preference if preview is supported
	$effect(() => {
		if (activeFile) {
			if (activeFile.type === 'html' || activeFile.type === 'markdown') {
				const storedTab = localStorage.getItem('canvas_active_tab');
				if (storedTab === 'code') {
					activeTab = 'code';
				} else {
					activeTab = 'preview';
				}
			} else {
				activeTab = 'code';
			}
		}
	});

	// Save activeTab to localStorage on change
	$effect(() => {
		localStorage.setItem('canvas_active_tab', activeTab);
	});

	// Keep editor content in sync with the active file
	$effect(() => {
		if (activeFile) {
			editorContent = activeFile.content;
		} else {
			editorContent = '';
		}
	});

	// Helper to sync file to local workspace via bridge
	async function syncFileToWorkspace(name: string, content: string) {
		const isBridgeEnabled = localStorage.getItem('workspace_enable_bridge') === 'true';
		const bridgeUrl = localStorage.getItem('workspace_bridge_url') || 'http://localhost:3000';
		if (isBridgeEnabled && bridgeUrl) {
			try {
				const cleanUrl = bridgeUrl.replace(/\/$/, '');
				await fetch(`${cleanUrl}/file`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ path: name, content })
				});
			} catch (e) {
				console.error('Failed to sync manual edit to local workspace:', e);
			}
		}
	}

	// Debounced Auto-save to IndexedDB
	let saveTimeout: any;
	function handleEditorInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		editorContent = target.value;

		if (!activeFile) return;

		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			if (!activeFile) return;
			await db.canvasFiles.put({
				chatId,
				name: activeFile.name,
				type: activeFile.type,
				content: editorContent,
				updatedAt: Date.now()
			});
			await syncFileToWorkspace(activeFile.name, editorContent);
		}, 300);
	}

	// Make typing Tab key insert 2 spaces instead of shifting focus
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			const textarea = textareaElement;
			if (!textarea) return;

			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const val = textarea.value;

			editorContent = val.substring(0, start) + '  ' + val.substring(end);
			
			// Put cursor position back correctly after DOM update
			setTimeout(() => {
				textarea.selectionStart = textarea.selectionEnd = start + 2;
				syncScroll();
			}, 0);

			if (activeFile) {
				clearTimeout(saveTimeout);
				saveTimeout = setTimeout(async () => {
					if (!activeFile) return;
					await db.canvasFiles.put({
						chatId,
						name: activeFile.name,
						type: activeFile.type,
						content: editorContent,
						updatedAt: Date.now()
					});
					await syncFileToWorkspace(activeFile.name, editorContent);
				}, 300);
			}
		}
	}

	// Delete file from Canvas
	async function handleDeleteFile() {
		if (!activeFile) return;
		const confirmDelete = confirm(`Are you sure you want to delete "${activeFile.name}"?`);
		if (confirmDelete) {
			await db.canvasFiles.delete([chatId, activeFile.name]);
		}
	}

	// Code highlighting language detection
	const prismLanguageClass = $derived.by(() => {
		if (!activeFile) return 'language-javascript';
		const ext = activeFile.name.split('.').pop() || 'js';
		if (ext === 'ts' || ext === 'tsx') return 'language-typescript';
		if (ext === 'py') return 'language-python';
		if (ext === 'css') return 'language-css';
		if (ext === 'json') return 'language-json';
		if (ext === 'html') return 'language-markup';
		if (ext === 'sh' || ext === 'bash') return 'language-bash';
		return 'language-javascript';
	});

	// Code highlighting generator
	const highlightedCode = $derived.by(() => {
		if (!activeFile) return '';
		const ext = activeFile.name.split('.').pop() || 'js';
		let lang = 'javascript';
		if (ext === 'ts' || ext === 'tsx') lang = 'typescript';
		else if (ext === 'py') lang = 'python';
		else if (ext === 'css') lang = 'css';
		else if (ext === 'json') lang = 'json';
		else if (ext === 'html') lang = 'markup';
		else if (ext === 'sh' || ext === 'bash') lang = 'bash';

		const grammar = Prism.languages[lang] || Prism.languages.javascript;
		try {
			return Prism.highlight(editorContent, grammar, lang);
		} catch (e) {
			return editorContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}
	});
</script>

<div class="canvas-panel-container">
	{#if activeFile}
		<div class="canvas-panel-header">
			<!-- Selector & Actions -->
			<div class="canvas-file-selector-row">
				<div class="canvas-select-wrapper">
					<select
						value={activeFile.name}
						onchange={(e) => onChangeActiveFile((e.target as HTMLSelectElement).value)}
						class="canvas-file-select"
					>
						{#each files as file}
							<option value={file.name}>{file.name}</option>
						{/each}
					</select>
					<svg class="canvas-select-chevron" viewBox="0 0 24 24" width="16" height="16">
						<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
					</svg>
				</div>

				<div class="canvas-action-buttons">
					<button class="canvas-action-btn delete-btn" onclick={handleDeleteFile} title="Delete File">
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Nav Tabs -->
		<div class="canvas-nav-tabs">
			{#if hasPreview}
				<button
					class="canvas-tab-btn"
					class:active={activeTab === 'preview'}
					onclick={() => (activeTab = 'preview')}
				>
					<svg viewBox="0 0 24 24" width="14" height="14">
						<path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
					</svg>
					Preview
				</button>
			{/if}
			<button
				class="canvas-tab-btn"
				class:active={activeTab === 'code'}
				onclick={() => (activeTab = 'code')}
			>
				<svg viewBox="0 0 24 24" width="14" height="14">
					<path fill="currentColor" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
				</svg>
				Code
			</button>
		</div>

		<!-- Content Display Area -->
		<div class="canvas-content-area">
			{#if activeTab === 'code'}
				<!-- Combined Code & Edit View using overlapping scroll-synced elements -->
				<div class="canvas-editor-wrapper">
					<textarea
						bind:this={textareaElement}
						value={editorContent}
						oninput={handleEditorInput}
						onscroll={syncScroll}
						onkeydown={handleKeyDown}
						class="canvas-editor-textarea"
						placeholder="Write code or content here..."
						spellcheck="false"
					></textarea>
					<pre
						bind:this={preElement}
						class="{prismLanguageClass} editor-highlight-pre"
					><code class={prismLanguageClass}>{@html highlightedCode}</code></pre>
				</div>
			{:else}
				<div class="canvas-preview-pane">
					{#if activeFile.type === 'html'}
						<!-- HTML Preview inside sandboxed iframe -->
						<iframe
							class="canvas-iframe-preview"
							title="HTML Live Preview"
							srcdoc={editorContent}
							sandbox="allow-scripts"
						></iframe>
					{:else if activeFile.type === 'markdown'}
						<!-- Markdown Preview -->
						<div class="markdown-body">
							{@html renderMarkdown(editorContent)}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="canvas-empty-state">
			<svg viewBox="0 0 24 24" width="48" height="48" class="empty-icon">
				<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
			</svg>
			<h5>No files created in this chat</h5>
			<p>Ask AI to create or modify code, HTML pages, or documents to view them in Canvas.</p>
		</div>
	{/if}
</div>

<style>
	.canvas-editor-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		background-color: var(--bg-primary);
		overflow: hidden;
	}

	.canvas-editor-textarea {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 2;
		background: transparent;
		color: transparent !important;
		caret-color: var(--text-primary) !important;
		font-family: var(--font-mono), monospace !important;
		font-size: calc(var(--chat-font-size, 15px) * 0.88) !important;
		line-height: 1.5 !important;
		padding: 16px 20px !important;
		border: none !important;
		outline: none !important;
		resize: none !important;
		overflow: auto !important;
		white-space: pre !important;
		box-sizing: border-box !important;
	}

	.editor-highlight-pre {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
		margin: 0 !important;
		padding: 16px 20px !important;
		border: none !important;
		background-color: var(--bg-primary) !important;
		pointer-events: none;
		overflow: hidden !important;
		font-family: var(--font-mono), monospace !important;
		font-size: calc(var(--chat-font-size, 15px) * 0.88) !important;
		line-height: 1.5 !important;
		white-space: pre !important;
		box-sizing: border-box !important;
	}

	.editor-highlight-pre :global(code) {
		font-family: inherit !important;
		font-size: inherit !important;
		line-height: inherit !important;
		background: transparent !important;
		padding: 0 !important;
		border: none !important;
	}
</style>
