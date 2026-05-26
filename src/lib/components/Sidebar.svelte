<script lang="ts">
	import type { Conversation, OllamaModel, Project, ProjectFile } from '$lib/types';
	
	let {
		conversations = [],
		currentConversationId = null,
		projects = [],
		globalContext = $bindable(''),
		ollamaUrl = $bindable(),
		activeModels = $bindable(['']),
		modelTemperatures = $bindable([0.7, 0.7, 0.7]),
		topP = $bindable(0.9),
		topK = $bindable(40),
		numCtx = $bindable(4096),
		numPredict = $bindable(0),
		repeatPenalty = $bindable(1.1),
		isConnected = false,
		models = [],
		generatingConversations = {},
		onSelectConversation,
		onNewConversation,
		onDeleteConversation,
		onUpdateTitle,
		onRefreshModels,
		onCreateProject,
		onUpdateProject,
		onDeleteProject,
		onNewConversationInProject,
		projectSettingsToOpenId = $bindable(null),
		isSettingsOpen = $bindable(false)
	} = $props<{
		conversations: Conversation[];
		currentConversationId: string | null;
		projects: Project[];
		globalContext: string;
		ollamaUrl: string;
		activeModels: string[];
		modelTemperatures: number[];
		topP: number;
		topK: number;
		numCtx: number;
		numPredict: number;
		repeatPenalty: number;
		isConnected: boolean;
		models: OllamaModel[];
		generatingConversations?: Record<string, boolean>;
		onSelectConversation: (id: string) => void;
		onNewConversation: () => void;
		onDeleteConversation: (id: string) => void;
		onUpdateTitle: (id: string, newTitle: string) => void;
		onRefreshModels: () => void;
		onCreateProject: (name: string, context?: string) => void;
		onUpdateProject: (id: string, name: string, context: string) => void;
		onDeleteProject: (id: string, deleteChats: boolean) => void;
		onNewConversationInProject: (projectId: string) => void;
		projectSettingsToOpenId: string | null;
		isSettingsOpen?: boolean;
	}>();

	let showAdvancedSettings = $state(false);

	function addModelStep() {
		if (activeModels.length < 3) {
			const nextModelName = models[0]?.name || '';
			activeModels = [...activeModels, nextModelName];
			const defaultTemp = activeModels.length === 2 ? 0.2 : 0.7;
			modelTemperatures = [...modelTemperatures, defaultTemp];
		}
	}

	function removeModelStep(index: number) {
		if (index > 0) {
			activeModels = activeModels.filter((_: string, i: number) => i !== index);
			modelTemperatures = modelTemperatures.filter((_: number, i: number) => i !== index);
		}
	}

	function updateModelStep(index: number, val: string) {
		activeModels = activeModels.map((m: string, i: number) => i === index ? val : m);
	}

	function updateModelTemp(index: number, val: number) {
		modelTemperatures = modelTemperatures.map((t: number, i: number) => i === index ? val : t);
	}

	let editingId = $state<string | null>(null);
	let editTitle = $state<string>('');

	// Projects state
	let collapsedProjects = $state<Record<string, boolean>>({});
	let isProjectSettingsOpen = $state(false);
	let selectedProjectForSettings = $state<Project | null>(null);
	let projectSettingsName = $state('');
	let projectSettingsContext = $state('');
	let projectSettingsFiles = $state<ProjectFile[]>([]);
	let deleteProjectChatsOption = $state(false);

	// File upload states
	let fileInputRef = $state<HTMLInputElement | null>(null);
	let isReadingFile = $state(false);
	let fileError = $state<string | null>(null);

	function startEdit(conv: Conversation, e: Event) {
		e.stopPropagation();
		editingId = conv.id;
		editTitle = conv.title;
	}

	// Dynamic relative time reactive update
	let now = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => {
			now = Date.now();
		}, 30000);
		return () => clearInterval(interval);
	});

	function getConversationLastActive(conv: Conversation): number {
		if (conv.messages && conv.messages.length > 0) {
			const lastMsg = conv.messages[conv.messages.length - 1];
			return lastMsg.timestamp || conv.createdAt;
		}
		return conv.createdAt;
	}

	function formatRelativeTime(timestamp: number): string {
		if (!timestamp) return '';
		const diffMs = now - timestamp;
		if (diffMs < 0) return 'now';
		
		const diffMins = Math.floor(diffMs / 60000);
		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m`;
		
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h`;
		
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d`;
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

	// Project operations
	function toggleProject(projectId: string) {
		collapsedProjects[projectId] = !collapsedProjects[projectId];
	}

	function openCreateProjectModal() {
		selectedProjectForSettings = null;
		projectSettingsName = '';
		projectSettingsContext = '';
		projectSettingsFiles = [];
		fileError = null;
		isProjectSettingsOpen = true;
	}

	function openProjectSettings(project: Project, e: Event) {
		e.stopPropagation();
		selectedProjectForSettings = project;
		projectSettingsName = project.name;
		projectSettingsContext = project.context || '';
		projectSettingsFiles = project.files ? [...project.files] : [];
		fileError = null;
		deleteProjectChatsOption = false;
		isProjectSettingsOpen = true;
	}

	function closeProjectSettings() {
		isProjectSettingsOpen = false;
		selectedProjectForSettings = null;
	}

	function saveProjectSettings() {
		if (!projectSettingsName.trim()) return;
		if (selectedProjectForSettings) {
			onUpdateProject(selectedProjectForSettings.id, projectSettingsName.trim(), projectSettingsContext.trim(), projectSettingsFiles);
		} else {
			onCreateProject(projectSettingsName.trim(), projectSettingsContext.trim(), projectSettingsFiles);
		}
		closeProjectSettings();
	}

	function handleDeleteProjectClick() {
		if (!selectedProjectForSettings) return;
		onDeleteProject(selectedProjectForSettings.id, deleteProjectChatsOption);
		closeProjectSettings();
	}

	function handleNewChatInProject(projectId: string, e: Event) {
		e.stopPropagation();
		collapsedProjects[projectId] = false; // Make sure it's expanded
		onNewConversationInProject(projectId);
	}

	function handleFileUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		const fileList = target.files;
		if (!fileList || fileList.length === 0) return;
		
		isReadingFile = true;
		fileError = null;

		const file = fileList[0];
		
		// 1.5MB Limit to prevent localStorage QuotaExceededError
		if (file.size > 1.5 * 1024 * 1024) {
			fileError = `File "${file.name}" is too large (> 1.5 MB). Please choose a smaller reference file.`;
			isReadingFile = false;
			return;
		}

		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target?.result as string;
			const newFile: ProjectFile = {
				id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				name: file.name,
				content,
				size: file.size
			};
			projectSettingsFiles = [...projectSettingsFiles, newFile];
			isReadingFile = false;
			if (fileInputRef) fileInputRef.value = '';
		};
		reader.onerror = () => {
			fileError = `Failed to read file "${file.name}".`;
			isReadingFile = false;
		};
		reader.readAsText(file);
	}

	function removeProjectFile(fileId: string) {
		projectSettingsFiles = projectSettingsFiles.filter(f => f.id !== fileId);
	}

	const totalFilesSize = $derived(
		projectSettingsFiles.reduce((acc, f) => acc + f.size, 0)
	);

	// Sort conversations: most recently active first
	const sortedConversations = $derived(
		[...conversations].sort((a, b) => getConversationLastActive(b) - getConversationLastActive(a))
	);

	const independentConvs = $derived(sortedConversations.filter((c: Conversation) => !c.projectId));

	function isProjectActive(projectId: string): boolean {
		const activeConv = conversations.find((c: Conversation) => c.id === currentConversationId);
		return activeConv?.projectId === projectId;
	}

	// Listen to externally triggered project settings requests
	$effect(() => {
		if (projectSettingsToOpenId) {
			const proj = projects.find((p: Project) => p.id === projectSettingsToOpenId);
			if (proj) {
				selectedProjectForSettings = proj;
				projectSettingsName = proj.name;
				projectSettingsContext = proj.context || '';
				projectSettingsFiles = proj.files ? [...proj.files] : [];
				deleteProjectChatsOption = false;
				isProjectSettingsOpen = true;
			}
			projectSettingsToOpenId = null;
		}
	});
</script>

<aside class="sidebar">
	<!-- Sidebar Header -->
	<div class="sidebar-header">
		<div class="logo">
			<svg class="glow-icon" viewBox="0 0 24 24" width="24" height="24">
				<path fill="currentColor" d="M12 2L2 22h20L12 2zm0 3.99L18.8 19H5.2L12 5.99zM12 17c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1zm0-7.75c.41 0 .75-.34.75-.75s-.34-.75-.75-.75-.75.34-.75.75.34.75.75.75z"/>
			</svg>
			<span>Order AI</span>
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
		<div class="history-header">
			<div class="history-title">Projects</div>
			<button class="add-project-btn" onclick={openCreateProjectModal} title="Create New Project">
				<svg viewBox="0 0 24 24" width="16" height="16">
					<path fill="currentColor" d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/>
				</svg>
			</button>
		</div>

		<div class="projects-list">
			{#if projects.length === 0}
				<div class="empty-projects-message text-muted">No projects yet. Create one to organize chats.</div>
			{:else}
				{#each projects as project (project.id)}
					<div class="project-folder-group">
						<!-- Project Folder Header -->
						<div class="project-folder-header" class:active-project={isProjectActive(project.id)}>
							<button class="project-toggle-btn" onclick={() => toggleProject(project.id)}>
								<svg class="folder-chevron" class:collapsed={collapsedProjects[project.id]} viewBox="0 0 24 24" width="14" height="14">
									<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
								</svg>
								<svg class="folder-icon" viewBox="0 0 24 24" width="16" height="16">
									<path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
								</svg>
								<span class="project-name">{project.name}</span>
							</button>

							<div class="project-actions">
								<button class="project-action-btn" onclick={(e) => openProjectSettings(project, e)} title="Project Settings & Context">
									<svg viewBox="0 0 24 24" width="14" height="14">
										<path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
									</svg>
								</button>
								<button class="project-action-btn" onclick={(e) => handleNewChatInProject(project.id, e)} title="New Conversation in Project">
									<svg viewBox="0 0 24 24" width="14" height="14">
										<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
									</svg>
								</button>
							</div>
						</div>

						<!-- Project Chat List -->
						{#if !collapsedProjects[project.id]}
							<div class="project-chats-list">
								{#if conversations.filter((c: Conversation) => c.projectId === project.id).length === 0}
									<div class="empty-project-chats">No conversations in project</div>
								{:else}
									<div class="conversation-list">
										{#each sortedConversations.filter((c: Conversation) => c.projectId === project.id) as conv (conv.id)}
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
													{#if generatingConversations[conv.id]}
														<span class="chat-time-indicator generating">
															<svg class="time-spinner" viewBox="0 0 24 24" width="14" height="14">
																<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="42" stroke-dashoffset="14" />
															</svg>
														</span>
													{:else}
														<span class="chat-time-indicator">{formatRelativeTime(getConversationLastActive(conv))}</span>
													{/if}
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
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<div class="history-header unassigned-header">
			<div class="history-title">Independent Chats</div>
		</div>

		{#if independentConvs.length === 0}
			<div class="empty-history">No independent chats</div>
		{:else}
			<div class="conversation-list">
				{#each independentConvs as conv (conv.id)}
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
							{#if generatingConversations[conv.id]}
								<span class="chat-time-indicator generating">
									<svg class="time-spinner" viewBox="0 0 24 24" width="14" height="14">
										<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="42" stroke-dashoffset="14" />
									</svg>
								</span>
							{:else}
								<span class="chat-time-indicator">{formatRelativeTime(getConversationLastActive(conv))}</span>
							{/if}
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
				class:open={!isSettingsOpen} 
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

				<!-- Model Chain Settings -->
				<div class="setting-item model-chain-section">
					<label style="font-weight: 600; color: var(--accent-blue); margin-bottom: 6px;">โครงสร้างโมเดล (Model Chain)</label>
					
					<div class="model-chain-list">
						{#each activeModels as model, idx (idx)}
							<div class="chain-step animate-fade-in">
								<div class="chain-step-header">
									<span class="step-badge">โมเดล {idx + 1}</span>
									<span class="step-role-label">
										{#if idx === 0}
											(Chat / Refiner)
										{:else if idx === 1 && activeModels.length === 2}
											(Executor)
										{:else if idx === 1}
											(Executor Step 2)
										{:else}
											(Translator Step 3)
										{/if}
									</span>
									{#if idx > 0}
										<button 
											class="remove-step-btn" 
											onclick={() => removeModelStep(idx)}
											title="Remove this model"
										>
											✕
										</button>
									{/if}
								</div>

								<select 
									class="model-select-dropdown" 
									value={model}
									onchange={(e) => updateModelStep(idx, e.currentTarget.value)}
								>
									{#if models.length === 0}
										<option value="">No models found</option>
									{:else}
										{#if !model}
											<option value="">Select a model...</option>
										{/if}
										{#each models as m}
											<option value={m.name}>{m.name}</option>
										{/each}
									{/if}
								</select>

								<!-- Temp slider for this model -->
								<div class="step-temp-container">
									<div class="setting-label-row">
										<label style="font-size: 0.7rem;">จินตนาการ (Temp):</label>
										<div class="setting-value-wrapper">
											<button 
												class="reset-individual-btn" 
												onclick={() => modelTemperatures[idx] = (idx === 1 ? 0.2 : 0.7)} 
												title="Reset Temperature"
											>
												<svg viewBox="0 0 24 24" width="10" height="10">
													<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
												</svg>
											</button>
											<span class="setting-value" style="font-size: 0.7rem; padding: 0 4px;">
												{(modelTemperatures[idx] !== undefined ? modelTemperatures[idx] : 0.7).toFixed(2)}
											</span>
										</div>
									</div>
									<div class="slider-container">
										<input 
											type="range" 
											min="0" 
											max="1.5" 
											step="0.05" 
											value={modelTemperatures[idx] !== undefined ? modelTemperatures[idx] : 0.7}
											oninput={(e) => updateModelTemp(idx, parseFloat(e.currentTarget.value))}
											class="temperature-slider"
										/>
									</div>
								</div>
							</div>
						{/each}
					</div>

					{#if activeModels.length < 3}
						<button 
							class="add-step-btn" 
							onclick={addModelStep}
							disabled={models.length === 0}
						>
							<svg viewBox="0 0 24 24" width="14" height="14">
								<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
							</svg>
							<span>เพิ่มโมเดลถัดไป (สูงสุด 3 โมเดล)</span>
						</button>
					{/if}
				</div>

				<div class="setting-item">
					<label for="sidebar-global-context">Global Context (All Chats)</label>
					<textarea 
						id="sidebar-global-context"
						placeholder="Enter global system instructions..." 
						bind:value={globalContext}
						rows="3"
						class="global-context-textarea"
					></textarea>
				</div>

				<!-- Collapsible Advanced Settings -->
				<div class="advanced-settings-wrapper" style="margin-top: 8px; border-top: 1px solid var(--border-light); padding-top: 10px;">
					<button 
						type="button" 
						class="advanced-settings-toggle-btn"
						onclick={() => showAdvancedSettings = !showAdvancedSettings}
					>
						<span>การตั้งค่าขั้นสูง (Advanced Settings)</span>
						<svg 
							class="chevron" 
							class:open={showAdvancedSettings} 
							viewBox="0 0 24 24" 
							width="14" 
							height="14"
						>
							<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
						</svg>
					</button>

					{#if showAdvancedSettings}
						<div class="advanced-settings-panel animate-fade-in" style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
							<!-- Top P -->
							<div class="setting-item">
								<div class="setting-label-row">
									<label for="topp-slider">สัดส่วนความน่าจะเป็นสะสม (Top P)</label>
									<div class="setting-value-wrapper">
										<button 
											class="reset-individual-btn" 
											onclick={() => topP = 0.9} 
											title="คืนค่าเริ่มต้น Top P"
										>
											<svg viewBox="0 0 24 24" width="12" height="12">
												<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
											</svg>
										</button>
										<span class="setting-value">{topP.toFixed(2)}</span>
									</div>
								</div>
								<div class="slider-container">
									<input 
										id="topp-slider"
										type="range" 
										min="0" 
										max="1" 
										step="0.01" 
										bind:value={topP}
										class="temperature-slider"
									/>
								</div>
							</div>

							<!-- Top K -->
							<div class="setting-item">
								<div class="setting-label-row">
									<label for="topk-slider">จำนวนกลุ่มคำที่มีโอกาสสูงสุด (Top K)</label>
									<div class="setting-value-wrapper">
										<button 
											class="reset-individual-btn" 
											onclick={() => topK = 40} 
											title="คืนค่าเริ่มต้น Top K"
										>
											<svg viewBox="0 0 24 24" width="12" height="12">
												<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
											</svg>
										</button>
										<span class="setting-value">{topK}</span>
									</div>
								</div>
								<div class="slider-container">
									<input 
										id="topk-slider"
										type="range" 
										min="1" 
										max="100" 
										step="1" 
										bind:value={topK}
										class="temperature-slider"
									/>
								</div>
							</div>

							<!-- Context Limit -->
							<div class="setting-item">
								<div class="setting-label-row">
									<label for="numctx-slider">หน่วยความจำแชต (Context Limit)</label>
									<div class="setting-value-wrapper">
										<button 
											class="reset-individual-btn" 
											onclick={() => numCtx = 4096} 
											title="คืนค่าเริ่มต้น Context Limit"
										>
											<svg viewBox="0 0 24 24" width="12" height="12">
												<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
											</svg>
										</button>
										<span class="setting-value">{numCtx}</span>
									</div>
								</div>
								<div class="slider-container">
									<input 
										id="numctx-slider"
										type="range" 
										min="1024" 
										max="32768" 
										step="1024" 
										bind:value={numCtx}
										class="temperature-slider"
									/>
								</div>
							</div>

							<!-- Max Tokens -->
							<div class="setting-item">
								<div class="setting-label-row">
									<label for="numpredict-slider">จำกัดคำตอบสูงสุด (Max Tokens)</label>
									<div class="setting-value-wrapper">
										<button 
											class="reset-individual-btn" 
											onclick={() => numPredict = 0} 
											title="คืนค่าเริ่มต้น Max Tokens"
										>
											<svg viewBox="0 0 24 24" width="12" height="12">
												<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
											</svg>
										</button>
										<span class="setting-value">{numPredict === 0 ? 'ไม่จำกัด' : numPredict}</span>
									</div>
								</div>
								<div class="slider-container">
									<input 
										id="numpredict-slider"
										type="range" 
										min="0" 
										max="8192" 
										step="128" 
										bind:value={numPredict}
										class="temperature-slider"
									/>
								</div>
							</div>

							<!-- Repeat Penalty -->
							<div class="setting-item">
								<div class="setting-label-row">
									<label for="repeatpenalty-slider">อัตราลดการพูดซ้ำ (Repeat Penalty)</label>
									<div class="setting-value-wrapper">
										<button 
											class="reset-individual-btn" 
											onclick={() => repeatPenalty = 1.1} 
											title="คืนค่าเริ่มต้น Repeat Penalty"
										>
											<svg viewBox="0 0 24 24" width="12" height="12">
												<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
											</svg>
										</button>
										<span class="setting-value">{repeatPenalty.toFixed(2)}</span>
									</div>
								</div>
								<div class="slider-container">
									<input 
										id="repeatpenalty-slider"
										type="range" 
										min="0.5" 
										max="2.0" 
										step="0.05" 
										bind:value={repeatPenalty}
										class="temperature-slider"
									/>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<div class="connection-status text-muted">
					{#if isConnected}
						<span class="text-success">Connected. Found {models.length} models.</span>
					{:else}
						<span class="text-error">Disconnected. Make sure Ollama is running.</span>
						{#if typeof window !== 'undefined' && 
							(window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') && 
							(ollamaUrl.includes('localhost') || ollamaUrl.includes('127.0.0.1'))}
							<div class="cors-help">
								<p class="cors-tip-title">To connect local Ollama from a deployed site:</p>
								<ol>
									<li>Close the Ollama app.</li>
									<li>Run in Terminal to allow CORS:
										<pre><code>launchctl setenv OLLAMA_ORIGINS "*"</code></pre>
									</li>
									<li>Restart Ollama.</li>
								</ol>
								<p class="cors-tip-note">Alternatively, use ngrok to create a secure HTTPS URL for Ollama.</p>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Project Settings Modal (rendered relative to viewport) -->
	{#if isProjectSettingsOpen}
		<div class="modal-backdrop" onclick={closeProjectSettings} onkeydown={(e) => e.key === 'Escape' && closeProjectSettings()} role="button" tabindex="-1">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="project-modal-content animate-zoom-in" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
				<div class="modal-header">
					<h3>{selectedProjectForSettings ? 'Project Settings' : 'Create New Project'}</h3>
					<button class="modal-close-btn" onclick={closeProjectSettings} title="Close dialog">✕</button>
				</div>
				
				<div class="modal-body">
					<div class="modal-form-item">
						<label for="project-name-input">Project Name</label>
						<input 
							id="project-name-input"
							type="text" 
							bind:value={projectSettingsName} 
							placeholder="Enter project name (e.g. Book, monitor)"
						/>
					</div>
					
					<div class="modal-form-item">
						<label for="project-context-textarea">Project Context (System Instruction)</label>
						<textarea 
							id="project-context-textarea"
							bind:value={projectSettingsContext} 
							placeholder="Enter context instructions that will apply to all chats in this project..." 
							rows="5"
						></textarea>
						<p class="modal-help-text">This context prompt will be automatically injected into all chats inside this project.</p>
					</div>

					<div class="modal-form-item">
						<div class="files-section-header">
							<span class="files-section-title">Reference Files (.txt, .md, etc.)</span>
							<span class="files-size-indicator" class:size-warning={totalFilesSize > 1.2 * 1024 * 1024}>
								{Math.round(totalFilesSize / 1024)} KB / 1536 KB
							</span>
						</div>
						
						<!-- Files List -->
						<div class="modal-files-list">
							{#if projectSettingsFiles.length === 0}
								<div class="empty-files-message text-muted">No reference files attached yet.</div>
							{:else}
								{#each projectSettingsFiles as file}
									<div class="project-file-item">
										<div class="file-item-left">
											<svg class="file-icon" viewBox="0 0 24 24" width="16" height="16">
												<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
											</svg>
											<span class="project-file-name" title={file.name}>{file.name}</span>
											<span class="project-file-size">({Math.round(file.size / 1024)} KB)</span>
										</div>
										<button class="remove-file-btn" onclick={() => removeProjectFile(file.id)} title="Remove File">
											✕
										</button>
									</div>
								{/each}
							{/if}
						</div>

						<!-- File Upload Input -->
						<div class="file-upload-wrapper">
							<input 
								type="file" 
								id="project-file-upload" 
								accept=".txt,.md,.js,.ts,.json,.css,.html,.svelte" 
								onchange={handleFileUpload} 
								bind:this={fileInputRef}
								style="display: none;"
							/>
							<button 
								type="button" 
								class="upload-trigger-btn" 
								onclick={() => fileInputRef?.click()}
								disabled={isReadingFile || totalFilesSize >= 1.5 * 1024 * 1024}
							>
								{#if isReadingFile}
									<div class="upload-spinner"></div>
									<span>Reading file...</span>
								{:else}
									<svg viewBox="0 0 24 24" width="16" height="16">
										<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
									</svg>
									<span>Attach Reference File</span>
								{/if}
							</button>
						</div>
						
						{#if fileError}
							<div class="file-upload-error">{fileError}</div>
						{/if}
					</div>

					{#if selectedProjectForSettings}
						<div class="modal-delete-section">
							<div class="danger-title">Danger Zone</div>
							<div class="delete-controls">
								<label class="checkbox-label" for="delete-chats-checkbox">
									<input type="checkbox" id="delete-chats-checkbox" bind:checked={deleteProjectChatsOption} />
									<span>Also delete all chats inside this project</span>
								</label>
								<button class="delete-project-btn" onclick={handleDeleteProjectClick}>
									Delete Project
								</button>
							</div>
						</div>
					{/if}
				</div>
				
				<div class="modal-footer">
					<button class="modal-btn secondary" onclick={closeProjectSettings}>Cancel</button>
					<button 
						class="modal-btn primary" 
						onclick={saveProjectSettings}
						disabled={!projectSettingsName.trim()}
					>
						{selectedProjectForSettings ? 'Save Changes' : 'Create Project'}
					</button>
				</div>
			</div>
		</div>
	{/if}
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

	.chat-time-indicator {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
		margin-left: auto;
		padding-right: 4px;
		transition: opacity var(--transition-fast);
	}

	.conversation-item:hover .chat-time-indicator {
		opacity: 0;
	}

	.chat-time-indicator.generating {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-blue);
	}

	.time-spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
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

	.setting-value-wrapper {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.reset-individual-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 2px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.reset-individual-btn:hover {
		color: var(--accent-blue);
		background-color: var(--bg-hover);
	}

	.settings-drawer {
		padding: 6px 10px 10px 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background-color: var(--bg-primary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		margin-top: 4px;
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.setting-item label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.setting-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.setting-value {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--accent-blue);
		background-color: var(--inline-code-bg);
		padding: 1px 6px;
		border-radius: 4px;
		border: 1px solid var(--inline-code-border);
		font-family: var(--font-mono);
	}

	.slider-container {
		display: flex;
		align-items: center;
		padding: 2px 0;
	}

	.temperature-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: var(--bg-tertiary);
		outline: none;
		transition: background var(--transition-fast);
		cursor: pointer;
	}

	.temperature-slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: var(--bg-tertiary);
	}

	.temperature-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent-blue);
		cursor: pointer;
		margin-top: -4px;
		box-shadow: 0 0 6px rgba(168, 199, 250, 0.4);
		transition: transform var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.temperature-slider::-webkit-slider-thumb:hover {
		background: var(--accent-blue-hover);
		transform: scale(1.2);
		box-shadow: 0 0 8px rgba(168, 199, 250, 0.6);
	}

	.temperature-slider::-moz-range-track {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: var(--bg-tertiary);
	}

	.temperature-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent-blue);
		cursor: pointer;
		border: none;
		box-shadow: 0 0 6px rgba(168, 199, 250, 0.4);
		transition: transform var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.temperature-slider::-moz-range-thumb:hover {
		background: var(--accent-blue-hover);
		transform: scale(1.2);
		box-shadow: 0 0 8px rgba(168, 199, 250, 0.6);
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

	.cors-help {
		margin-top: 10px;
		padding: 10px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--text-secondary);
		text-align: left;
	}

	.cors-tip-title {
		margin: 0 0 6px 0;
		color: var(--text-primary);
		font-weight: 600;
	}

	.cors-help ol {
		margin: 0;
		padding-left: 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.cors-help li {
		margin-bottom: 2px;
	}

	.cors-help pre {
		background-color: var(--bg-tertiary);
		padding: 4px 6px;
		border-radius: 4px;
		margin: 4px 0;
		overflow-x: auto;
		border: 1px solid var(--border-light);
	}

	.cors-help code {
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
		color: var(--accent-blue, #a8c7fa);
	}

	.cors-tip-note {
		margin: 8px 0 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.text-success {
		color: #51cf66;
	}

	.text-error {
		color: #ff6b6b;
	}

	/* Projects & Modal CSS */
	.history-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
		padding: 0 4px 0 12px;
	}

	.add-project-btn {
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

	.add-project-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.projects-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 20px;
	}

	.empty-projects-message {
		font-size: 0.78rem;
		padding: 12px;
		text-align: center;
		border: 1px dashed var(--border-color);
		border-radius: 8px;
		margin: 0 4px;
	}

	.project-folder-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.project-folder-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		border-radius: 8px;
		transition: background-color var(--transition-fast);
	}

	.project-folder-header:hover {
		background-color: rgba(255, 255, 255, 0.03);
	}

	.project-folder-header.active-project {
		background-color: rgba(168, 199, 250, 0.04);
	}

	.project-toggle-btn {
		background: none;
		border: none;
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-secondary);
		font-size: 0.88rem;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
		padding: 4px;
		min-width: 0;
	}

	.project-toggle-btn:hover {
		color: var(--text-primary);
	}

	.folder-chevron {
		color: var(--text-muted);
		transition: transform var(--transition-normal);
		flex-shrink: 0;
	}

	.folder-chevron.collapsed {
		transform: rotate(-90deg);
	}

	.folder-icon {
		color: var(--accent-blue);
		opacity: 0.85;
		flex-shrink: 0;
	}

	.project-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.project-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0;
		transition: opacity var(--transition-fast);
	}

	.project-folder-header:hover .project-actions {
		opacity: 1;
	}

	.project-action-btn {
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

	.project-action-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.project-chats-list {
		padding-left: 20px;
		border-left: 1px solid var(--border-light);
		margin-left: 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 2px;
		margin-bottom: 4px;
	}

	.empty-project-chats {
		font-size: 0.78rem;
		color: var(--text-muted);
		padding: 6px 12px;
		font-style: italic;
	}

	.unassigned-header {
		margin-top: 10px;
		border-top: 1px solid var(--border-light);
		padding-top: 14px;
	}

	.global-context-textarea {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 8px;
		color: var(--text-primary);
		font-size: 0.82rem;
		resize: vertical;
		outline: none;
		font-family: inherit;
		line-height: 1.4;
	}

	.global-context-textarea:focus {
		border-color: var(--accent-blue);
	}

	/* Modal Overlay CSS */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background-color: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 999;
	}

	.project-modal-content {
		width: 480px;
		max-width: 90%;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-light);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.modal-header h3 {
		font-family: var(--font-title);
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.modal-close-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: background-color var(--transition-fast);
	}

	.modal-close-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.modal-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.modal-form-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.modal-form-item label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.modal-form-item input {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 10px 12px;
		color: var(--text-primary);
		font-size: 0.88rem;
		outline: none;
		transition: border-color var(--transition-fast);
	}

	.modal-form-item input:focus {
		border-color: var(--accent-blue);
	}

	.modal-form-item textarea {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 10px 12px;
		color: var(--text-primary);
		font-size: 0.88rem;
		outline: none;
		resize: vertical;
		transition: border-color var(--transition-fast);
		font-family: inherit;
		line-height: 1.4;
	}

	.modal-form-item textarea:focus {
		border-color: var(--accent-blue);
	}

	.modal-help-text {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.modal-delete-section {
		margin-top: 8px;
		border-top: 1px solid var(--border-light);
		padding-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.danger-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #ff6b6b;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.delete-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.82rem;
		color: var(--text-secondary);
		cursor: pointer;
		user-select: none;
	}

	.checkbox-label input {
		cursor: pointer;
	}

	.delete-project-btn {
		background-color: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
		padding: 8px 14px;
		border-radius: 6px;
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--transition-fast), border-color var(--transition-fast);
	}

	.delete-project-btn:hover {
		background-color: rgba(255, 107, 107, 0.2);
		border-color: rgba(255, 107, 107, 0.3);
	}

	.modal-footer {
		padding: 16px 20px;
		border-top: 1px solid var(--border-light);
		background-color: var(--bg-tertiary);
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
	}

	.modal-btn {
		padding: 10px 18px;
		border-radius: 8px;
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.modal-btn.primary {
		background-color: var(--accent-blue);
		border: 1px solid var(--accent-blue);
		color: #131314; /* Dark text for high contrast on light blue background in dark mode */
		font-weight: 600;
	}

	:global([data-theme^="light"]) .modal-btn.primary {
		color: #ffffff; /* White text for high contrast on dark blue background in light mode */
		font-weight: 500;
	}

	.modal-btn.primary:hover:not(:disabled) {
		background-color: var(--accent-blue-hover);
		border-color: var(--accent-blue-hover);
	}

	.modal-btn.primary:disabled {
		background-color: var(--bg-tertiary);
		border-color: var(--border-color);
		color: var(--text-muted);
		opacity: 0.6;
		cursor: not-allowed;
	}

	.modal-btn.secondary {
		background: none;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
	}

	.modal-btn.secondary:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.animate-zoom-in {
		animation: zoomIn var(--transition-normal) cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes zoomIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Project files styling */
	.files-section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2px;
	}

	.files-section-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.files-size-indicator {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.files-size-indicator.size-warning {
		color: #ffaa00;
	}

	.modal-files-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 10px;
		max-height: 150px;
		overflow-y: auto;
	}

	.empty-files-message {
		font-size: 0.8rem;
		text-align: center;
		padding: 8px 0;
	}

	.project-file-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
	}

	.file-item-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.project-file-name {
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 220px;
	}

	.project-file-size {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.remove-file-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.remove-file-btn:hover {
		background-color: rgba(255, 107, 107, 0.1);
		color: #ff6b6b;
	}

	.file-upload-wrapper {
		display: flex;
		width: 100%;
	}

	.upload-trigger-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 10px;
		background-color: var(--bg-primary);
		border: 1px dashed var(--border-color);
		border-radius: 8px;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
		transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
		cursor: pointer;
	}

	.upload-trigger-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		border-color: var(--accent-blue);
		color: var(--text-primary);
	}

	.upload-trigger-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.upload-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(168, 199, 250, 0.2);
		border-radius: 50%;
		border-top-color: var(--accent-blue);
		animation: spin 0.8s linear infinite;
	}

	.file-upload-error {
		font-size: 0.78rem;
		color: #ff6b6b;
		margin-top: 4px;
	}

	.model-chain-section {
		border-top: 1px solid var(--border-light);
		padding-top: 12px;
		margin-top: 8px;
	}

	.model-chain-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 8px;
	}

	.chain-step {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background-color: var(--bg-secondary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		position: relative;
	}

	.chain-step-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.step-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		background-color: var(--accent-blue);
		color: #ffffff;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.step-role-label {
		font-size: 0.65rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.remove-step-btn {
		margin-left: auto;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 6px;
		border-radius: 4px;
		transition: all var(--transition-fast);
	}

	.remove-step-btn:hover {
		color: #ff6b6b;
		background-color: var(--bg-hover);
	}

	.step-temp-container {
		margin-top: 4px;
		padding-top: 4px;
		border-top: 1px dashed var(--border-light);
	}

	.add-step-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 8px;
		border-radius: 6px;
		border: 1px dashed var(--border-color);
		background: none;
		color: var(--accent-blue);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.add-step-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		border-color: var(--accent-blue);
	}

	.add-step-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.advanced-settings-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		padding: 4px 0;
		transition: color var(--transition-fast);
	}

	.advanced-settings-toggle-btn:hover {
		color: var(--text-primary);
	}

	.sub-setting-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.model-select-dropdown {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 6px 10px;
		color: var(--text-primary);
		font-size: 0.85rem;
		outline: none;
		cursor: pointer;
		width: 100%;
		transition: border-color var(--transition-fast);
	}

	.model-select-dropdown:focus {
		border-color: var(--accent-blue);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-secondary);
		cursor: pointer;
		user-select: none;
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
