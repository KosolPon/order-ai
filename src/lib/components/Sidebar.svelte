<script lang="ts">
	import type { Conversation, OllamaModel } from '$lib/types';
	
	let {
		conversations = [],
		currentConversationId = null,
		ollamaUrl = $bindable(),
		isConnected = false,
		models = [],
		onSelectConversation,
		onNewConversation,
		onDeleteConversation,
		onUpdateTitle,
		onRefreshModels
	} = $props<{
		conversations: Conversation[];
		currentConversationId: string | null;
		ollamaUrl: string;
		isConnected: boolean;
		models: OllamaModel[];
		onSelectConversation: (id: string) => void;
		onNewConversation: () => void;
		onDeleteConversation: (id: string) => void;
		onUpdateTitle: (id: string, newTitle: string) => void;
		onRefreshModels: () => void;
	}>();

	let editingId = $state<string | null>(null);
	let editTitle = $state<string>('');
	let isSettingsOpen = $state(false);

	function startEdit(conv: Conversation, e: Event) {
		e.stopPropagation();
		editingId = conv.id;
		editTitle = conv.title;
	}

	function saveEdit(id: string) {
		if (editTitle.trim()) {
			onUpdateTitle(id, editTitle.trim());
		}
		editingId = null;
	}

	function handleKeydown(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter') {
			saveEdit(id);
		} else if (e.key === 'Escape') {
			editingId = null;
		}
	}

	function autofocus(node: HTMLElement) {
		node.focus();
	}
</script>

<aside class="sidebar">
	<!-- Sidebar Header -->
	<div class="sidebar-header">
		<div class="logo">
			<svg class="glow-icon" viewBox="0 0 24 24" width="24" height="24">
				<path fill="currentColor" d="M12 2L2 22h20L12 2zm0 3.99L18.8 19H5.2L12 5.99zM12 17c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1zm0-7.75c.41 0 .75-.34.75-.75s-.34-.75-.75-.75-.75.34-.75.75.34.75.75.75z"/>
			</svg>
			<span>Antigravity Ollama</span>
		</div>
		<button class="new-chat-btn" onclick={onNewConversation}>
			<svg viewBox="0 0 24 24" width="18" height="18">
				<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
			</svg>
			<span>New Conversation</span>
		</button>
	</div>

	<!-- History Navigation -->
	<div class="history-container">
		<div class="history-title">Conversations</div>
		{#if conversations.length === 0}
			<div class="empty-history">No conversations yet</div>
		{:else}
			<div class="conversation-list">
				{#each conversations as conv (conv.id)}
					<div 
						class="conversation-item" 
						class:active={currentConversationId === conv.id}
						onclick={() => onSelectConversation(conv.id)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && onSelectConversation(conv.id)}
					>
						<svg class="chat-icon" viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
						</svg>

						{#if editingId === conv.id}
							<input 
								type="text" 
								class="title-edit-input" 
								bind:value={editTitle}
								onclick={(e) => e.stopPropagation()}
								onblur={() => saveEdit(conv.id)}
								onkeydown={(e) => handleKeydown(e, conv.id)}
								use:autofocus
							/>
						{:else}
							<span class="conv-title">{conv.title}</span>
						{/if}

						<div class="actions">
							{#if editingId !== conv.id}
								<button 
									class="action-btn" 
									onclick={(e) => startEdit(conv, e)} 
									title="Rename"
								>
									<svg viewBox="0 0 24 24" width="14" height="14">
										<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
									</svg>
								</button>
							{/if}
							<button 
								class="action-btn delete" 
								onclick={(e) => {
									e.stopPropagation();
									onDeleteConversation(conv.id);
								}} 
								title="Delete"
							>
								<svg viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Sidebar Footer -->
	<div class="sidebar-footer">
		<button class="footer-btn" onclick={() => isSettingsOpen = !isSettingsOpen}>
			<div class="status-indicator-wrapper">
				<span class="status-dot" class:connected={isConnected}></span>
				<span>Settings & Connection</span>
			</div>
			<svg 
				class="chevron" 
				class:open={isSettingsOpen} 
				viewBox="0 0 24 24" 
				width="16" 
				height="16"
			>
				<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
			</svg>
		</button>

		{#if isSettingsOpen}
			<div class="settings-drawer animate-fade-in">
				<div class="setting-item">
					<label for="ollama-url">Ollama Server URL</label>
					<div class="url-input-group">
						<input 
							id="ollama-url"
							type="text" 
							placeholder="http://localhost:11434" 
							bind:value={ollamaUrl}
						/>
						<button class="refresh-btn" onclick={onRefreshModels} title="Refresh connection">
							<svg viewBox="0 0 24 24" width="14" height="14">
								<path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
							</svg>
						</button>
					</div>
				</div>

				<div class="connection-status text-muted">
					{#if isConnected}
						<span class="text-success">Connected. Found {models.length} models.</span>
					{:else}
						<span class="text-error">Disconnected. Make sure Ollama is running.</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</aside>

<style>
	.sidebar {
		width: var(--sidebar-width, 280px);
		min-width: var(--sidebar-width, 280px);
		height: 100%;
		background-color: var(--bg-secondary);
		border-right: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		transition: width var(--transition-normal);
		z-index: 10;
		overflow: hidden;
	}

	.sidebar-header {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		border-bottom: 1px solid var(--border-light);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 12px;
		font-family: var(--font-title);
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.glow-icon {
		color: var(--accent-blue);
		filter: drop-shadow(0 0 4px rgba(168, 199, 250, 0.4));
	}

	.new-chat-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		padding: 10px 16px;
		border-radius: 99px;
		font-weight: 500;
		transition: all var(--transition-fast);
		box-shadow: var(--shadow-sm);
	}

	.new-chat-btn:hover {
		background: var(--bg-hover);
		border-color: var(--accent-blue);
		box-shadow: 0 0 8px rgba(168, 199, 250, 0.15);
	}

	.history-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: 16px 8px;
	}

	.history-title {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		color: var(--text-muted);
		margin-bottom: 12px;
		padding-left: 12px;
		font-weight: 600;
	}

	.empty-history {
		font-size: 0.85rem;
		color: var(--text-muted);
		text-align: center;
		padding: 32px 16px;
	}

	.conversation-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.conversation-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast), color var(--transition-fast);
		position: relative;
		user-select: none;
	}

	.conversation-item:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.conversation-item.active {
		background-color: var(--bg-active);
		color: var(--text-primary);
		font-weight: 500;
	}

	.chat-icon {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.conversation-item.active .chat-icon {
		color: var(--accent-blue);
	}

	.conv-title {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-right: 8px;
	}

	.title-edit-input {
		flex: 1;
		background: var(--bg-primary);
		border: 1px solid var(--accent-blue);
		border-radius: 4px;
		padding: 2px 6px;
		color: var(--text-primary);
		font-size: 0.9rem;
		min-width: 0;
	}

	.actions {
		display: none;
		align-items: center;
		gap: 4px;
		position: absolute;
		right: 8px;
		background: linear-gradient(90deg, transparent 0%, var(--bg-hover) 20%, var(--bg-hover) 100%);
		padding-left: 12px;
		height: 100%;
		border-radius: 0 8px 8px 0;
	}

	.conversation-item.active .actions {
		background: linear-gradient(90deg, transparent 0%, var(--bg-active) 20%, var(--bg-active) 100%);
	}

	.conversation-item:hover .actions {
		display: flex;
	}

	.action-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.action-btn:hover {
		background-color: var(--bg-active);
		color: var(--text-primary);
	}

	.conversation-item.active .action-btn:hover {
		background-color: var(--bg-hover);
	}

	.action-btn.delete:hover {
		color: #ff6b6b;
	}

	.sidebar-footer {
		padding: 8px;
		border-top: 1px solid var(--border-light);
		background-color: var(--bg-secondary);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.footer-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast);
	}

	.footer-btn:hover {
		background-color: var(--bg-hover);
	}

	.status-indicator-wrapper {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: #ff6b6b;
		transition: background-color var(--transition-normal);
		box-shadow: 0 0 4px rgba(255, 107, 107, 0.4);
	}

	.status-dot.connected {
		background-color: #51cf66;
		box-shadow: 0 0 4px rgba(81, 207, 102, 0.4);
	}

	.chevron {
		color: var(--text-muted);
		transition: transform var(--transition-normal);
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.settings-drawer {
		padding: 8px 12px 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		background-color: var(--bg-primary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		margin-top: 4px;
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.setting-item label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.url-input-group {
		display: flex;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		overflow: hidden;
		background-color: var(--bg-secondary);
	}

	.url-input-group input {
		flex: 1;
		padding: 6px 10px;
		font-size: 0.85rem;
		min-width: 0;
	}

	.refresh-btn {
		padding: 6px 8px;
		background-color: var(--bg-tertiary);
		border-left: 1px solid var(--border-color);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.refresh-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.connection-status {
		font-size: 0.75rem;
	}

	.text-success {
		color: #51cf66;
	}

	.text-error {
		color: #ff6b6b;
	}

	@media (max-width: 768px) {
		.sidebar {
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			box-shadow: var(--shadow-lg);
		}
	}
</style>
