<script lang="ts">
	import type { Conversation, Project } from '$lib/types';
	import { renderMarkdown, type ParsedThinking } from '$lib/markdown';
	import { db } from '$lib/db';
	import { liveQuery } from 'dexie';
	import CanvasPanel from './CanvasPanel.svelte';

	let {
		conversation = null,
		projects = [],
		globalContext = '',
		activeThinking = null,
		activeTab = 'context',
		isGenerating = false,
		activeCanvasFileName = null,
		onChangeActiveCanvasFile,
		onChangeTab,
		onUpdateChatContext,
		onUpdateChatProject,
		onEditProjectSettings,
		onClose
	} = $props<{
		conversation: Conversation | null;
		projects: Project[];
		globalContext: string;
		activeThinking: ParsedThinking | null;
		activeTab: 'context' | 'thinking' | 'canvas';
		isGenerating: boolean;
		activeCanvasFileName: string | null;
		onChangeActiveCanvasFile: (name: string | null) => void;
		onChangeTab: (tab: 'context' | 'thinking' | 'canvas') => void;
		onUpdateChatContext: (id: string, context: string) => void;
		onUpdateChatProject: (id: string, projectId: string | undefined) => void;
		onEditProjectSettings: (projectId: string) => void;
		onClose: () => void;
	}>();

	// Reactive Canvas files count
	let canvasFilesCount = $state(0);
	$effect(() => {
		if (!conversation) {
			canvasFilesCount = 0;
			return;
		}
		const subscription = liveQuery(() => db.canvasFiles.where({ chatId: conversation.id }).count()).subscribe((count) => {
			canvasFilesCount = count;
		});
		return () => subscription.unsubscribe();
	});

	// Active project derived from current conversation's projectId
	const activeProject = $derived(
		conversation?.projectId ? projects.find((p: Project) => p.id === conversation.projectId) : null
	);

	// Combined prompt preview
	const combinedPrompt = $derived.by(() => {
		if (!conversation) return '';
		const parts: string[] = [];
		if (globalContext.trim()) {
			parts.push(`[Global Context]:\n${globalContext.trim()}`);
		}
		if (activeProject) {
			let projectPrompt = '';
			if (activeProject.context?.trim()) {
				projectPrompt += `[Project Context - ${activeProject.name}]:\n${activeProject.context.trim()}`;
			}
			
			// Inject file contents if present in preview
			if (activeProject.files && activeProject.files.length > 0) {
				if (projectPrompt) projectPrompt += '\n\n';
				projectPrompt += `[Project Reference Files - ${activeProject.name}]:\n`;
				projectPrompt += `CRITICAL DIRECTIVE: You must use the following files as your primary reference and knowledge source for all your answers in this conversation. If there are any differences between these files and your pre-trained knowledge (e.g. Svelte 5 runes syntax vs older versions), you MUST prioritize the information and syntax described in these files:`;
				for (const file of activeProject.files) {
					projectPrompt += `\n\nFile "${file.name}":\n\`\`\`\n${file.content}\n\`\`\``;
				}
			}
			
			if (projectPrompt) {
				parts.push(projectPrompt);
			}
		}
		if (conversation.context?.trim()) {
			parts.push(`[Chat Context]:\n${conversation.context.trim()}`);
		}
		return parts.join('\n\n');
	});

	function handleProjectChange(e: Event) {
		if (!conversation) return;
		const target = e.target as HTMLSelectElement;
		const val = target.value;
		onUpdateChatProject(conversation.id, val ? val : undefined);
	}

	function handleContextChange(e: Event) {
		if (!conversation) return;
		const target = e.target as HTMLTextAreaElement;
		onUpdateChatContext(conversation.id, target.value);
	}

	function autoScroll(node: HTMLElement, params: { active: boolean; text: string }) {
		let lastScrollHeight = node.scrollHeight;

		const scroll = () => {
			if (params.active && node.scrollHeight > 0) {
				node.scrollTop = node.scrollHeight;
				lastScrollHeight = node.scrollHeight;
			}
		};

		// Scroll initially
		setTimeout(scroll, 50);

		return {
			update(newParams: { active: boolean; text: string }) {
				params = newParams;
				
				// Check if the user was at the bottom of the container BEFORE Svelte updates the layout
				const wasAtBottom = lastScrollHeight - node.scrollTop - node.clientHeight < 40;
				
				if (params.active && wasAtBottom) {
					setTimeout(() => {
						node.scrollTop = node.scrollHeight;
						lastScrollHeight = node.scrollHeight;
					}, 0);
				} else {
					setTimeout(() => {
						lastScrollHeight = node.scrollHeight;
					}, 0);
				}
			}
		};
	}
</script>

{#if conversation}
	<div class="context-panel animate-slide-in">
		<div class="panel-header">
			<div class="panel-title-wrapper">
				<svg viewBox="0 0 24 24" width="18" height="18" class="panel-header-icon">
					<path fill="currentColor" d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
				</svg>
				<h3>{activeTab === 'context' ? 'Context Settings' : 'Thinking Process'}</h3>
			</div>
			<button class="close-panel-btn" onclick={onClose} title="Close Panel">
				<svg viewBox="0 0 24 24" width="18" height="18">
					<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
				</svg>
			</button>
		</div>

		<!-- Panel Tab Bar -->
		<div class="panel-tabs">
			<button 
				type="button"
				class="panel-tab-btn" 
				class:active={activeTab === 'context'} 
				onclick={() => onChangeTab('context')}
			>
				<svg viewBox="0 0 24 24" width="14" height="14">
					<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
				</svg>
				Settings
			</button>
			<button 
				type="button"
				class="panel-tab-btn" 
				class:active={activeTab === 'thinking'} 
				onclick={() => onChangeTab('thinking')}
				title="View reasoning thoughts"
			>
				<svg viewBox="0 0 24 24" width="14" height="14" class={activeThinking?.isThinking && isGenerating ? 'animate-pulse text-thinking' : ''}>
					<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.04 19.64 10.46 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm1-9h-2v2h2V9zm0 4h-2v4h2v-4z"/>
				</svg>
				Thinking
				{#if activeThinking?.isThinking && isGenerating}
					<span class="thinking-dot"></span>
				{/if}
			</button>
			<button 
				type="button"
				class="panel-tab-btn" 
				class:active={activeTab === 'canvas'} 
				onclick={() => onChangeTab('canvas')}
				title="View Canvas workspace"
			>
				<svg viewBox="0 0 24 24" width="14" height="14">
					<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
				</svg>
				Canvas
				{#if canvasFilesCount > 0}
					<span class="canvas-badge-count">{canvasFilesCount}</span>
				{/if}
			</button>
		</div>

		{#if activeTab === 'context'}
			<div class="panel-content">
				<!-- Project Assignment -->
				<div class="panel-section">
					<label for="chat-project-select" class="section-label">Project Assignment</label>
					<div class="select-wrapper">
						<select 
							id="chat-project-select"
							value={conversation.projectId || ''} 
							onchange={handleProjectChange}
							class="panel-select"
						>
							<option value="">(None - Independent Chat)</option>
							{#each projects as project}
								<option value={project.id}>{project.name}</option>
							{/each}
						</select>
						<svg class="select-chevron" viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
						</svg>
					</div>
					<p class="section-desc">Assigning this chat to a project links it to the project's context rules.</p>
				</div>

				<!-- Chat Context Textarea -->
				<div class="panel-section">
					<div class="section-header-row">
						<label for="chat-context-textarea" class="section-label">Chat-Level Context</label>
						<span class="badge badge-chat">Chat</span>
					</div>
					<textarea
						id="chat-context-textarea"
						value={conversation.context || ''}
						oninput={handleContextChange}
						placeholder="Enter specific rules or topics for this chat only (e.g. 'Answer in Thai', 'Act as a senior Svelte developer')"
						class="panel-textarea"
						rows="4"
					></textarea>
					<p class="section-desc">Instructions defined here will apply only to this conversation.</p>
				</div>

				<!-- Project Context Preview -->
				<div class="panel-section">
					<div class="section-header-row">
						<span class="section-label">Project-Level Context</span>
						<span class="badge badge-project">Project</span>
					</div>
					{#if activeProject}
						<div class="context-preview-box">
							<div class="preview-header">
								<span class="project-name-badge">
									<svg viewBox="0 0 24 24" width="12" height="12">
										<path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
									</svg>
									{activeProject.name}
								</span>
								<button class="edit-link-btn" onclick={() => onEditProjectSettings(activeProject.id)}>
									Edit Project Context
								</button>
							</div>
							<div class="preview-text">
								{activeProject.context.trim() ? activeProject.context : 'No project context configured. Click edit to configure.'}
							</div>
						</div>
					{:else}
						<div class="empty-context-preview text-muted">
							This chat does not belong to any project. Select a project above to inherit its context rules.
						</div>
					{/if}
				</div>

				<!-- Global Context Preview -->
				<div class="panel-section">
					<div class="section-header-row">
						<span class="section-label">Global-Level Context</span>
						<span class="badge badge-global">Global</span>
					</div>
					<div class="context-preview-box">
						<div class="preview-text">
							{globalContext.trim() ? globalContext : 'No global context configured. Configure it in the Settings Drawer at the bottom left.'}
						</div>
					</div>
				</div>

				<!-- Combined Prompts Preview -->
				<div class="panel-section combined-preview-section">
					<details class="preview-details">
						<summary class="preview-summary">
							<span>Preview Combined System Prompt</span>
							<svg class="details-chevron" viewBox="0 0 24 24" width="16" height="16">
								<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
							</svg>
						</summary>
						<div class="combined-prompt-output">
							{#if combinedPrompt.trim()}
								<pre>{combinedPrompt}</pre>
							{:else}
								<span class="empty-combined text-muted">No context prompt active. Prompt will be sent cleanly without system instructions.</span>
							{/if}
						</div>
					</details>
				</div>
			</div>
		{:else if activeTab === 'thinking'}
			<div class="panel-content thinking-content-panel">
				{#if activeThinking}
					<div class="thinking-header-row">
						<h4>Reasoning Stream</h4>
						{#if activeThinking.isThinking && isGenerating}
							<span class="thinking-status-active">
								<span class="pulsing-circle"></span>
								Thinking...
							</span>
						{:else}
							<span class="thinking-status-done">Completed</span>
						{/if}
					</div>
					<div class="thinking-scroller markdown-body" use:autoScroll={{ active: !!(activeThinking.isThinking && isGenerating), text: activeThinking.thinking }}>
						{@html renderMarkdown(activeThinking.thinking)}
					</div>
				{:else}
					<div class="thinking-empty-state">
						<svg viewBox="0 0 24 24" width="48" height="48" class="empty-icon">
							<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
						</svg>
						<h5>No Reasoning Content</h5>
						<p>This tab displays the real-time thought process of reasoning models (such as <strong>DeepSeek-R1</strong>).</p>
						<p class="empty-desc-secondary">If your selected model does not output <code>&lt;think&gt;</code> tags, no reasoning process will be shown here.</p>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'canvas'}
			<CanvasPanel
				chatId={conversation.id}
				activeFileName={activeCanvasFileName}
				onChangeActiveFile={onChangeActiveCanvasFile}
			/>
		{/if}
	</div>
{/if}

<style>
	.context-panel {
		width: var(--context-panel-width, 320px);
		min-width: var(--context-panel-width, 320px);
		height: 100%;
		background-color: var(--bg-secondary);
		border-left: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		z-index: 9;
		overflow: hidden;
	}

	.panel-header {
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-light);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.panel-title-wrapper {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text-primary);
	}

	.panel-header-icon {
		color: var(--accent-blue);
	}

	.panel-header h3 {
		font-family: var(--font-title);
		font-size: 1.05rem;
		font-weight: 600;
		margin: 0;
	}

	.close-panel-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 6px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.close-panel-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.panel-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.section-label {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-secondary);
	}

	.badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.badge-chat {
		background-color: rgba(168, 199, 250, 0.15);
		color: var(--accent-blue);
		border: 1px solid rgba(168, 199, 250, 0.25);
	}

	.badge-project {
		background-color: rgba(217, 101, 112, 0.15);
		color: #d96570;
		border: 1px solid rgba(217, 101, 112, 0.25);
	}

	.badge-global {
		background-color: rgba(155, 114, 203, 0.15);
		color: #9b72cb;
		border: 1px solid rgba(155, 114, 203, 0.25);
	}

	.section-desc {
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.35;
		margin: 0;
	}

	.select-wrapper {
		position: relative;
		display: flex;
		width: 100%;
	}

	.panel-select {
		width: 100%;
		appearance: none;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 10px 36px 10px 14px;
		color: var(--text-primary);
		font-size: 0.88rem;
		outline: none;
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		cursor: pointer;
	}

	.panel-select:focus {
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 2px rgba(168, 199, 250, 0.15);
	}

	.select-chevron {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-muted);
		pointer-events: none;
	}

	.panel-textarea {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 12px;
		color: var(--text-primary);
		font-size: 0.88rem;
		outline: none;
		resize: vertical;
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		font-family: inherit;
		line-height: 1.45;
	}

	.panel-textarea:focus {
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 2px rgba(168, 199, 250, 0.15);
	}

	.context-preview-box {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 12px;
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--border-light);
		padding-bottom: 6px;
	}

	.project-name-badge {
		font-weight: 600;
		color: var(--text-primary);
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.project-name-badge svg {
		color: var(--text-muted);
	}

	.edit-link-btn {
		background: none;
		border: none;
		color: var(--accent-blue);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
		transition: background-color var(--transition-fast);
	}

	.edit-link-btn:hover {
		background-color: rgba(168, 199, 250, 0.1);
		text-decoration: underline;
	}

	.preview-text {
		white-space: pre-wrap;
		color: var(--text-muted);
		max-height: 120px;
		overflow-y: auto;
		font-size: 0.8rem;
	}

	.empty-context-preview {
		background-color: rgba(30, 31, 32, 0.3);
		border: 1px dashed var(--border-color);
		border-radius: 8px;
		padding: 16px;
		font-size: 0.8rem;
		line-height: 1.4;
		text-align: center;
	}

	.combined-preview-section {
		border-top: 1px solid var(--border-light);
		padding-top: 20px;
		margin-top: 4px;
	}

	.preview-details {
		width: 100%;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background-color: var(--bg-primary);
		overflow: hidden;
	}

	.preview-summary {
		padding: 12px 14px;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		user-select: none;
		list-style: none; /* Hide default arrow */
	}

	.preview-summary::-webkit-details-marker {
		display: none; /* Hide default arrow in Safari */
	}

	.preview-summary span {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.details-chevron {
		color: var(--text-muted);
		transition: transform var(--transition-normal);
	}

	.preview-details[open] .details-chevron {
		transform: rotate(180deg);
	}

	.combined-prompt-output {
		padding: 12px;
		background-color: var(--bg-tertiary);
		border-top: 1px solid var(--border-color);
		max-height: 200px;
		overflow-y: auto;
	}

	.combined-prompt-output pre {
		margin: 0;
		font-family: var(--font-mono, monospace);
		font-size: 0.78rem;
		color: var(--text-secondary);
		white-space: pre-wrap;
		word-break: break-all;
		line-height: 1.45;
	}

	.empty-combined {
		font-size: 0.8rem;
		font-style: italic;
	}

	.text-muted {
		color: var(--text-muted);
	}

	.animate-slide-in {
		animation: slideIn var(--transition-normal) cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	/* Panel Tabs styling */
	.panel-tabs {
		display: flex;
		background-color: var(--bg-tertiary);
		border-bottom: 1px solid var(--border-color);
		padding: 0 10px;
	}

	.panel-tab-btn {
		flex: 1;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 12px 8px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		transition: all var(--transition-fast);
	}

	.panel-tab-btn:hover:not(:disabled) {
		color: var(--text-primary);
		background-color: rgba(255, 255, 255, 0.02);
	}

	.panel-tab-btn.active {
		color: var(--accent-blue);
		border-bottom-color: var(--accent-blue);
	}

	.panel-tab-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.thinking-content-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		height: 100%;
		padding: 20px;
		overflow: hidden;
	}

	.thinking-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.thinking-header-row h4 {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-primary);
		font-weight: 600;
	}

	.thinking-status-active {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.78rem;
		color: #e2a54b;
		font-weight: 500;
	}

	.thinking-status-done {
		font-size: 0.78rem;
		color: #5bb974;
		font-weight: 500;
		background-color: rgba(91, 185, 116, 0.1);
		padding: 2px 8px;
		border-radius: 12px;
	}

	.pulsing-circle {
		width: 8px;
		height: 8px;
		background-color: #e2a54b;
		border-radius: 50%;
		animation: pulse-orange 1.5s infinite;
	}

	@keyframes pulse-orange {
		0% {
			transform: scale(0.95);
			box-shadow: 0 0 0 0 rgba(226, 165, 75, 0.7);
		}
		70% {
			transform: scale(1);
			box-shadow: 0 0 0 6px rgba(226, 165, 75, 0);
		}
		100% {
			transform: scale(0.95);
			box-shadow: 0 0 0 0 rgba(226, 165, 75, 0);
		}
	}

	.thinking-scroller {
		flex: 1;
		background-color: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 16px;
		overflow-y: auto;
		height: calc(100% - 40px);
		font-size: calc(var(--chat-font-size, 15px) * 0.85);
	}

	.thinking-scroller :global(p) {
		margin-bottom: 0.75rem;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.thinking-scroller :global(p:last-child) {
		margin-bottom: 0;
	}

	.thinking-scroller :global(h1),
	.thinking-scroller :global(h2),
	.thinking-scroller :global(h3),
	.thinking-scroller :global(h4),
	.thinking-scroller :global(h5),
	.thinking-scroller :global(h6) {
		font-size: 1.05em;
		margin-top: 12px;
		margin-bottom: 6px;
		color: var(--text-primary);
	}

	.thinking-scroller :global(ul),
	.thinking-scroller :global(ol) {
		margin-bottom: 10px;
		padding-left: 20px;
	}

	.thinking-scroller :global(li) {
		color: var(--text-secondary);
		margin-bottom: 3px;
	}

	.thinking-scroller :global(code) {
		font-size: 0.9em;
	}

	.thinking-scroller :global(.code-block-wrapper) {
		margin: 10px 0;
		font-size: 0.95em;
	}

	.thinking-scroller :global(.code-block-header) {
		padding: 5px 10px;
	}

	.thinking-scroller :global(pre[class*="language-"]) {
		padding: 10px 14px;
	}

	.thinking-dot {
		width: 6px;
		height: 6px;
		background-color: var(--accent-blue);
		border-radius: 50%;
		display: inline-block;
	}

	.text-thinking {
		color: #e2a54b;
	}

	.thinking-empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 40px 20px;
		height: 100%;
		color: var(--text-muted);
	}

	.thinking-empty-state .empty-icon {
		color: var(--text-muted);
		opacity: 0.5;
		margin-bottom: 16px;
	}

	.thinking-empty-state h5 {
		margin: 0 0 8px 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.thinking-empty-state p {
		margin: 0 0 12px 0;
		font-size: 0.8rem;
		line-height: 1.45;
	}

	.thinking-empty-state .empty-desc-secondary {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: 10px;
		border-top: 1px dashed var(--border-color);
		padding-top: 12px;
		width: 100%;
	}
	.canvas-badge-count {
		font-size: 0.65rem;
		font-weight: 700;
		background-color: var(--accent-blue);
		color: var(--bg-primary);
		padding: 1px 5px;
		border-radius: 8px;
		margin-left: 4px;
		min-width: 16px;
		text-align: center;
	}
</style>
