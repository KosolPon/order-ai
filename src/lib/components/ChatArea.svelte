<script lang="ts">
	import type { Conversation, Message, Attachment } from '$lib/types';
	import { renderMarkdown } from '$lib/markdown';
	import { tick, untrack } from 'svelte';

	let {
		conversation = null,
		isGenerating = false,
		isInitialized = false,
		onSendPrompt,
		onEditPrompt,
		onStopGeneration
	} = $props<{
		conversation: Conversation | null;
		isGenerating: boolean;
		isInitialized: boolean;
		onSendPrompt: (prompt: string) => void;
		onEditPrompt: (messageId: string, newContent: string) => void;
		onStopGeneration: () => void;
	}>();

	let chatContainer = $state<HTMLDivElement | null>(null);
	let fontSize = $state(15);
	let editingMessageId = $state<string | null>(null);
	let editingMessageContent = $state('');

	let isExportMenuOpen = $state(false);

	// Close dropdown when clicking outside
	$effect(() => {
		if (isExportMenuOpen) {
			const handleOutsideClick = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (!target.closest('.export-controls')) {
					isExportMenuOpen = false;
				}
			};
			window.addEventListener('click', handleOutsideClick);
			return () => {
				window.removeEventListener('click', handleOutsideClick);
			};
		}
	});

	function exportToMarkdown() {
		if (!conversation) return;
		isExportMenuOpen = false;

		let mdContent = `# ${conversation.title}\n\n`;
		mdContent += `- **Model**: ${conversation.model || 'Unknown'}\n`;
		mdContent += `- **Date**: ${new Date(conversation.createdAt).toLocaleString()}\n\n`;
		mdContent += `---\n\n`;

		conversation.messages.forEach((msg: Message) => {
			if (msg.role === 'assistant' && msg.content === '') return;
			const roleName = msg.role === 'user' ? 'User' : `Assistant (${msg.model || conversation.model || 'Ollama'})`;
			mdContent += `### ${roleName}\n`;
			
			// Include attachments if any
			if (msg.attachments && msg.attachments.length > 0) {
				mdContent += `**Attachments:**\n`;
				msg.attachments.forEach((att: Attachment) => {
					if (att.type === 'image') {
						mdContent += `- [Image] ${att.name}\n`;
					} else {
						mdContent += `- [${att.type}] ${att.name}\n`;
					}
				});
				mdContent += `\n`;
			}

			mdContent += `${msg.content}\n\n`;
			mdContent += `---\n\n`;
		});

		// Trigger download
		const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		
		// Clean file name
		const safeTitle = conversation.title
			.toLowerCase()
			.replace(/[^a-z0-9\u0e00-\u0e7f]+/g, '-') // Allow Thai characters and alphanumeric
			.replace(/(^-|-$)/g, '');
		const fileName = safeTitle ? `${safeTitle}.md` : `chat-export.md`;

		link.setAttribute('download', fileName);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function exportToPdf() {
		isExportMenuOpen = false;
		window.print();
	}

	// Show thinking loader only before the first response chunk arrives
	const showThinking = $derived(
		isGenerating &&
		conversation &&
		conversation.messages.length > 0 &&
		conversation.messages[conversation.messages.length - 1].role === 'assistant' &&
		conversation.messages[conversation.messages.length - 1].content === ''
	);

	function startEditPrompt(msg: Message) {
		editingMessageId = msg.id;
		editingMessageContent = msg.content;
	}

	function saveEditPrompt(id: string) {
		if (editingMessageContent.trim()) {
			onEditPrompt(id, editingMessageContent.trim());
		}
		editingMessageId = null;
	}

	// Load stored font size on mount
	$effect(() => {
		untrack(() => {
			const storedSize = localStorage.getItem('chat_font_size');
			if (storedSize) {
				const parsed = parseInt(storedSize, 10);
				if (!isNaN(parsed) && parsed >= 10 && parsed <= 30) {
					fontSize = parsed;
				}
			}
		});
	});

	function increaseFont() {
		if (fontSize < 30) {
			fontSize += 1;
			localStorage.setItem('chat_font_size', fontSize.toString());
		}
	}

	function decreaseFont() {
		if (fontSize > 10) {
			fontSize -= 1;
			localStorage.setItem('chat_font_size', fontSize.toString());
		}
	}

	// Suggestions for empty state
	const suggestions = [
		{
			title: 'Write a Svelte 5 component',
			desc: 'for a sleek modal dialog using runes',
			prompt: 'Write a Svelte 5 component for a sleek modal dialog. Use TypeScript and Svelte 5 runes ($state, $props, $effect). Add beautiful transition animations and CSS styling.'
		},
		{
			title: 'Explain Svelte 5 Runes',
			desc: 'versus Svelte 3/4 stores and reactivity',
			prompt: 'Can you explain Svelte 5 Runes ($state, $derived, $effect) and compare them with Svelte 3/4 reactive statements ($:) and stores? Provide code examples showing how to convert a store-based component to runes.'
		},
		{
			title: 'Create a Python script',
			desc: 'to parse a JSON log file and extract errors',
			prompt: 'Write a Python script to parse a JSON log file, extract all logs that have level "ERROR" or "CRITICAL", and write them into a CSV file. Include sample data and make the code well-documented.'
		},
		{
			title: 'Design a CSS layout',
			desc: 'for a glassmorphism dashboard card',
			prompt: 'Design a modern CSS glassmorphism dashboard card. Provide the HTML structure and complete CSS styles. Include hover effects, backdrop-filter, border gradients, and dynamic shadow effects.'
		}
	];

	// Scroll to bottom whenever messages change or generation is active
	$effect(() => {
		if (conversation && conversation.messages) {
			// Trigger scroll to bottom
			scrollToBottom();
		}
	});

	async function scrollToBottom() {
		await tick();
		if (chatContainer) {
			chatContainer.scrollTo({
				top: chatContainer.scrollHeight,
				behavior: 'smooth'
			});
		}
	}
</script>

<div class="chat-area">
	<!-- Sticky Header Bar -->
	<header class="chat-header">
		<div class="chat-title">
			{#if conversation}
				{conversation.title}
			{:else}
				New Conversation
			{/if}
		</div>

		<div class="header-actions">
			{#if conversation && conversation.messages.length > 0}
				<div class="export-controls">
					<button 
						class="export-btn" 
						onclick={() => isExportMenuOpen = !isExportMenuOpen}
						aria-expanded={isExportMenuOpen}
						title="Export Chat"
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
						</svg>
						<span>Export</span>
						<svg class="chevron-down" class:open={isExportMenuOpen} viewBox="0 0 24 24" width="12" height="12">
							<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
						</svg>
					</button>

					{#if isExportMenuOpen}
						<div class="export-controls-dropdown animate-fade-in">
							<button class="dropdown-item" onclick={exportToMarkdown}>
								<svg viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
								</svg>
								<span>Export as Markdown (.md)</span>
							</button>
							<button class="dropdown-item" onclick={exportToPdf}>
								<svg viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9.5 8.5c0 .83-.67 1.5-1.5 1.5H7v1.5H5.5V9H8c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V9H13c.83 0 1.5.67 1.5 1.5v3zm4-3.5h-2.5v1H18v1.5h-1.5V14H15V9h4v1.5zM9 11.5H8v-1h1v1zm4 1.5h-1v-2h1v2z"/>
								</svg>
								<span>Export as PDF (.pdf)</span>
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<div class="font-controls">
				<button 
					class="font-btn" 
					onclick={decreaseFont} 
					disabled={fontSize <= 10}
					title="Decrease font size"
				>
					A-
				</button>
				<button 
					class="font-indicator-btn" 
					onclick={() => {
						fontSize = 15;
						localStorage.setItem('chat_font_size', '15');
					}}
					title="Reset to 100%"
				>
					{Math.round((fontSize / 15) * 100)}%
				</button>
				<button 
					class="font-btn" 
					onclick={increaseFont} 
					disabled={fontSize >= 30}
					title="Increase font size"
				>
					A+
				</button>
			</div>
		</div>
	</header>

	<div class="chat-viewport" bind:this={chatContainer} style="--chat-font-size: {fontSize}px">
		{#if !isInitialized}
			<div class="chat-loading-placeholder">
				<div class="spinner-glow"></div>
			</div>
		{:else if !conversation || conversation.messages.length === 0}
			<!-- Gemini-style Welcome Screen -->
			<div class="welcome-container animate-fade-in">
				<div class="welcome-header">
					<h1 class="gradient-text">Hello, Developer</h1>
					<h2 class="subtitle-text">What would you like to build or discuss today?</h2>
				</div>

				<div class="suggestions-grid">
					{#each suggestions as sug}
						<button 
							class="suggestion-card" 
							onclick={() => onSendPrompt(sug.prompt)}
						>
							<div class="sug-title">{sug.title}</div>
							<div class="sug-desc">{sug.desc}</div>
							<div class="sug-icon">
								<svg viewBox="0 0 24 24" width="18" height="18">
									<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
								</svg>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<!-- Message Thread -->
			<div class="messages-list">
				{#each conversation.messages as msg (msg.id)}
					{#if msg.role !== 'assistant' || msg.content !== ''}
						<div class="message-wrapper" class:user={msg.role === 'user'}>
						<div class="message-avatar">
							{#if msg.role === 'user'}
								<div class="avatar user-avatar">U</div>
							{:else}
								<div class="avatar ai-avatar">
									<svg viewBox="0 0 24 24" width="16" height="16">
										<path fill="currentColor" d="M12 2L2 22h20L12 2zm0 3.99L18.8 19H5.2L12 5.99zM12 17c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1zm0-7.75c.41 0 .75-.34.75-.75s-.34-.75-.75-.75-.75.34-.75.75.34.75.75.75z"/>
									</svg>
								</div>
							{/if}
						</div>
						
						<div class="message-body">
							<div class="message-info">
								<span class="sender-name">
									{msg.role === 'user' ? 'You' : (msg.model || 'Assistant')}
								</span>
								<span class="timestamp">
									{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
								</span>
							</div>

							<div class="message-content markdown-body">
								{#if msg.role === 'user'}
									{#if editingMessageId === msg.id}
										<!-- Edit prompt textarea -->
										<div class="edit-prompt-wrapper">
											<textarea 
												class="edit-prompt-textarea"
												bind:value={editingMessageContent}
												rows="3"
											></textarea>
											<div class="edit-prompt-actions">
												<button class="edit-btn cancel" onclick={() => editingMessageId = null}>
													Cancel
												</button>
												<button 
													class="edit-btn submit" 
													onclick={() => saveEditPrompt(msg.id)}
													disabled={!editingMessageContent.trim() || isGenerating}
												>
													Save & Submit
												</button>
											</div>
										</div>
									{:else}
										<div class="user-message-container">
											<div class="user-message-bubble-wrapper">
												{#if msg.attachments && msg.attachments.length > 0}
													<div class="message-attachments-grid">
														{#each msg.attachments as attr (attr.id)}
															<div class="msg-attachment-card">
																{#if attr.type === 'image'}
																	<img class="msg-attachment-image" src={attr.content} alt={attr.name} />
																{:else}
																	<div class="msg-attachment-info">
																		{#if attr.type === 'link'}
																			<svg class="msg-attachment-icon link-icon" viewBox="0 0 24 24" width="14" height="14">
																				<path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
																			</svg>
																		{:else}
																			<svg class="msg-attachment-icon file-icon" viewBox="0 0 24 24" width="14" height="14">
																				<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
																			</svg>
																		{/if}
																		<span class="msg-attachment-name" title={attr.name}>{attr.name}</span>
																	</div>
																{/if}
															</div>
														{/each}
													</div>
												{/if}
												{#if msg.content}
													<pre class="user-text-pre">{msg.content}</pre>
												{/if}
											</div>
											<button 
												class="message-edit-trigger" 
												onclick={() => startEditPrompt(msg)}
												title="Edit prompt"
											>
												<svg viewBox="0 0 24 24" width="14" height="14">
													<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
												</svg>
											</button>
										</div>
									{/if}
								{:else}
									<!-- Render parsed markdown -->
									{@html renderMarkdown(msg.content)}
								{/if}
							</div>
						</div>
					</div>
					{/if}
				{/each}

				{#if showThinking}
					<div class="message-wrapper assistant generating">
						<div class="message-avatar">
							<div class="avatar ai-avatar animate-pulse">
								<svg viewBox="0 0 24 24" width="16" height="16">
									<path fill="currentColor" d="M12 2L2 22h20L12 2zm0 3.99L18.8 19H5.2L12 5.99zM12 17c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1zm0-7.75c.41 0 .75-.34.75-.75s-.34-.75-.75-.75-.75.34-.75.75.34.75.75.75z"/>
								</svg>
							</div>
						</div>
						<div class="message-body">
							<div class="message-info">
								<span class="sender-name">Ollama</span>
								<span class="status-tag">Thinking...</span>
							</div>
							<div class="message-content markdown-body">
								<div class="typing-indicator">
									<span></span><span></span><span></span>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
	
</div>

<style>
	.chat-area {
		flex: 1;
		min-height: 0; /* Prevents flex items from overflowing their container */
		display: flex;
		flex-direction: column;
		background-color: var(--bg-primary);
		position: relative;
	}

	.chat-header {
		height: var(--header-height, 56px);
		border-bottom: 1px solid var(--border-color);
		background-color: rgba(19, 19, 20, 0.8);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 24px;
		z-index: 5;
		position: sticky;
		top: 0;
		flex-shrink: 0;
	}

	.chat-title {
		font-family: var(--font-title);
		font-weight: 500;
		font-size: 1.05rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 60%;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.export-controls {
		position: relative;
	}

	.export-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 20px;
		padding: 6px 14px;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
	}

	.export-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	.export-btn svg {
		flex-shrink: 0;
	}

	.chevron-down {
		color: var(--text-muted);
		transition: transform var(--transition-normal);
	}

	.chevron-down.open {
		transform: rotate(180deg);
	}

	.export-controls-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		background-color: rgba(30, 31, 32, 0.95);
		backdrop-filter: blur(12px);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		padding: 6px 0;
		width: 230px;
		z-index: 100;
		display: flex;
		flex-direction: column;
	}

	.dropdown-item {
		width: 100%;
		text-align: left;
		padding: 10px 16px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.85rem;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.dropdown-item:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.dropdown-item svg {
		color: var(--accent-blue);
		flex-shrink: 0;
	}

	.font-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 20px;
		padding: 3px 6px;
	}

	.font-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-weight: 600;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.font-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.font-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.font-indicator-btn {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-secondary);
		padding: 2px 6px;
		min-width: 44px;
		text-align: center;
		user-select: none;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.font-indicator-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.chat-viewport {
		flex: 1;
		overflow-y: auto;
		padding: 32px 16px 120px 16px; /* Generous bottom padding to prevent overlap with input area */
		display: flex;
		flex-direction: column;
	}

	/* Welcome screen styles */
	.welcome-container {
		max-width: 1000px;
		width: 100%;
		margin: auto;
		display: flex;
		flex-direction: column;
		gap: 40px;
		padding: 20px 0;
	}

	.welcome-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.gradient-text {
		font-family: var(--font-title);
		font-size: 3.2rem;
		font-weight: 600;
		line-height: 1.25;
		background: linear-gradient(74deg, #4285f4 0, #9b72cb 25%, #d96570 50%, #4285f4 100%);
		background-size: 200% auto;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		animation: pulseGradient 8s linear infinite;
	}

	.subtitle-text {
		font-family: var(--font-title);
		font-size: 2rem;
		font-weight: 500;
		color: var(--text-muted);
		line-height: 1.3;
	}

	.suggestions-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.suggestion-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 20px;
		text-align: left;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 130px;
		position: relative;
		transition: background-color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
	}

	.suggestion-card:hover {
		background-color: var(--bg-hover);
		border-color: var(--border-light);
		transform: translateY(-2px);
	}

	.sug-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 6px;
	}

	.sug-desc {
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.sug-icon {
		position: absolute;
		bottom: 16px;
		right: 16px;
		color: var(--text-muted);
		background: var(--bg-primary);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-color);
		opacity: 0;
		transform: scale(0.8);
		transition: opacity var(--transition-fast), transform var(--transition-fast);
	}

	.suggestion-card:hover .sug-icon {
		opacity: 1;
		transform: scale(1);
	}

	/* Message thread styling */
	.messages-list {
		max-width: 1000px;
		width: 100%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.message-wrapper {
		display: flex;
		gap: 20px;
		animation: fadeIn var(--transition-normal) forwards;
		position: relative;
	}

	@media (min-width: 1100px) {
		.message-wrapper {
			margin-left: -56px; /* Offset the avatar (36px width + 20px gap) to the left gutter */
		}
	}

	.message-wrapper.user {
		/* Right-align user messages slightly for cleaner hierarchy */
		flex-direction: row;
	}

	.message-avatar {
		flex-shrink: 0;
	}

	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.user-avatar {
		background-color: var(--bg-hover);
		color: var(--accent-blue);
		border: 1px solid var(--border-color);
	}

	.ai-avatar {
		background: linear-gradient(135deg, #4285f4, #9b72cb);
		color: #ffffff;
		box-shadow: var(--shadow-sm);
	}

	.message-body {
		flex: 1;
		min-width: 0; /* Important for preventing code block overflow */
	}

	.message-info {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 6px;
	}

	.sender-name {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text-primary);
	}

	.timestamp {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.status-tag {
		font-size: 0.75rem;
		color: var(--accent-blue);
		font-style: italic;
	}

	.message-content {
		color: var(--text-primary);
	}

	.user-text-pre {
		font-family: inherit;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: var(--chat-font-size, 15px);
		color: var(--text-primary);
		background-color: var(--bg-secondary);
		padding: 12px 16px;
		border-radius: 12px;
		border: 1px solid var(--border-color);
		max-width: 90%;
		display: inline-block;
	}

	.message-wrapper.user .message-body {
		text-align: left;
	}

	/* Typing indicator */
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
	}

	.typing-indicator span {
		width: 8px;
		height: 8px;
		background-color: var(--accent-blue);
		border-radius: 50%;
		display: inline-block;
		animation: bounce 1.4s infinite ease-in-out both;
	}

	.typing-indicator span:nth-child(1) {
		animation-delay: -0.32s;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: -0.16s;
	}

	@keyframes bounce {
		0%, 80%, 100% { transform: scale(0); }
		40% { transform: scale(1.0); }
	}

	.animate-pulse {
		animation: pulse 2s infinite ease-in-out;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 1; }
	}

	@media (max-width: 768px) {
		.welcome-container {
			gap: 24px;
		}

		.gradient-text {
			font-size: 2.2rem;
		}

		.subtitle-text {
			font-size: 1.4rem;
		}

		.suggestions-grid {
			grid-template-columns: 1fr;
			gap: 12px;
		}

		.suggestion-card {
			height: 100px;
		}
	}

	/* User message edit prompt styles */

	.user-message-container {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		position: relative;
		width: 100%;
	}

	.user-message-container:hover .message-edit-trigger {
		opacity: 1;
	}

	.message-edit-trigger {
		opacity: 0;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		color: var(--text-muted);
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
		margin-top: 8px;
		flex-shrink: 0;
	}

	.message-edit-trigger:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.edit-prompt-wrapper {
		display: flex;
		flex-direction: column;
		gap: 12px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		padding: 16px;
		border-radius: 12px;
		width: 100%;
		max-width: 90%;
	}

	.edit-prompt-textarea {
		width: 100%;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 10px 12px;
		color: var(--text-primary);
		font-family: var(--font-main);
		font-size: var(--chat-font-size, 15px);
		resize: vertical;
		outline: none;
	}

	.edit-prompt-textarea:focus {
		border-color: var(--accent-blue);
	}

	.edit-prompt-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.edit-btn {
		padding: 6px 14px;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		transition: background-color var(--transition-fast), opacity var(--transition-fast);
	}

	.edit-btn.cancel {
		background-color: transparent;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
	}

	.edit-btn.cancel:hover {
		background-color: var(--bg-hover);
	}

	.edit-btn.submit {
		background: linear-gradient(135deg, #4285f4, #9b72cb);
		color: #ffffff;
		border: none;
	}

	.edit-btn.submit:hover:not(:disabled) {
		opacity: 0.9;
	}

	.edit-btn.submit:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* User Message Attachments Grid */
	.user-message-bubble-wrapper {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 90%;
		align-items: flex-start;
	}

	.message-attachments-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 2px;
	}

	.msg-attachment-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		overflow: hidden;
		max-width: 220px;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-sm);
	}

	.msg-attachment-image {
		max-width: 100%;
		max-height: 150px;
		object-fit: cover;
		display: block;
	}

	.msg-attachment-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		font-size: 0.8rem;
		color: var(--text-primary);
	}

	.msg-attachment-icon {
		color: var(--accent-blue);
		flex-shrink: 0;
	}

	.msg-attachment-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
		font-weight: 500;
	}

	/* Loading Placeholder */
	.chat-loading-placeholder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.spinner-glow {
		width: 32px;
		height: 32px;
		border: 3px solid rgba(66, 133, 244, 0.1);
		border-radius: 50%;
		border-top-color: var(--accent-blue);
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
