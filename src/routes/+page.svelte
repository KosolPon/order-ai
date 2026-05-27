<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ChatArea from '$lib/components/ChatArea.svelte';
	import InputArea from '$lib/components/InputArea.svelte';
	import ContextPanel from '$lib/components/ContextPanel.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import { untrack } from 'svelte';
	
	import type { Conversation, Message, OllamaModel, Attachment, Project, ProjectFile } from '$lib/types';
	import { fetchModels, streamChat, DEFAULT_OLLAMA_URL, GEMINI_MODELS } from '$lib/ollama';
	import { parseThinking } from '$lib/markdown';
	import { db } from '$lib/db';
	import { parseCanvasTags } from '$lib/canvasParser';

	// Reactive States
	let conversations = $state<Conversation[]>([]);
	let currentConversationId = $state<string | null>(null);
	let ollamaUrl = $state<string>(DEFAULT_OLLAMA_URL);
	let geminiApiKey = $state<string>('');
	let ollamaCloudApiKey = $state<string>('');
	let ollamaCloudUrl = $state<string>('https://ollama.com');
	let enableOllamaLocal = $state<boolean>(true);
	let enableOllamaCloud = $state<boolean>(false);
	let enableGemini = $state<boolean>(false);
	let ollamaModels = $state<OllamaModel[]>([]);
	let ollamaCloudModels = $state<OllamaModel[]>([]);
	let isOllamaCloudConnected = $state<boolean>(false);
	let models = $derived.by(() => {
		const list = [];
		if (enableOllamaLocal) {
			list.push(...ollamaModels.map(m => ({ ...m, source: 'local' as const })));
		}
		if (enableOllamaCloud && ollamaCloudApiKey.trim()) {
			list.push(...ollamaCloudModels.map(m => ({ ...m, source: 'cloud' as const })));
		}
		if (enableGemini && geminiApiKey.trim()) {
			list.push(...GEMINI_MODELS.map(m => ({ ...m, source: 'gemini' as const })));
		}
		return list.sort((a, b) => a.name.localeCompare(b.name));
	});
	let selectedModel = $state<string>('');
	let activeModels = $state<string[]>(['']);
	let modelTemperatures = $state<number[]>([0.7, 0.7, 0.7]);
	let topP = $state<number>(0.9);
	let topK = $state<number>(40);
	let numCtx = $state<number>(4096);
	let numPredict = $state<number>(0);
	let repeatPenalty = $state<number>(1.1);
	let isSettingsOpen = $state<boolean>(false);
	let customizeSettings = $state<boolean>(false);
	let isConnected = $state<boolean>(false);
	let isGenerating = $state<boolean>(false);
	let input = $state<string>('');
	let drafts = $state<Record<string, string>>({});
	let attachments = $state<Attachment[]>([]);
	let isInitialized = $state(false);
	let theme = $state<string>('dark-blue');
	let fontFamily = $state<string>('inter');

	// Toggle between light and dark of the current color
	function handleToggleTheme() {
		const isDark = theme.startsWith('dark');
		const color = theme.split('-')[1] || 'blue';
		theme = isDark ? `light-${color}` : `dark-${color}`;
	}

	// Change color while preserving mode (light or dark)
	function handleSelectColor(color: string) {
		const isDark = theme.startsWith('dark');
		theme = isDark ? `dark-${color}` : `light-${color}`;
	}

	function getFontFamilyCss(fontId: string): string {
		switch (fontId) {
			case 'inter':
				return "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
			case 'outfit':
				return "'Outfit', 'Inter', system-ui, -apple-system, sans-serif";
			case 'lora':
				return "'Lora', Georgia, 'Times New Roman', serif";
			case 'fira-code':
				return "'Fira Code', 'Courier New', Courier, monospace";
			case 'system':
				return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
			default:
				return "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
		}
	}

	// Context and Project States
	let projects = $state<Project[]>([]);
	let globalContext = $state<string>('');
	let showContextPanel = $state<boolean>(false);
	let projectSettingsToOpenId = $state<string | null>(null);

	// UI layout state
	let showSidebar = $state<boolean>(true);
	let sidebarWidth = $state<number>(280);
	let contextPanelWidth = $state<number>(320);
	let isResizingLeft = $state<boolean>(false);
	let isResizingRight = $state<boolean>(false);
	let fontSize = $state(15);

	// Thinking / Reasoning states
	let rightPaneTab = $state<'context' | 'thinking' | 'canvas'>('context');
	let lastOpenedThinkingMsgId = $state<string | null>(null);
	let selectedThinkingMsgId = $state<string | null>(null);
	let activeCanvasFileName = $state<string | null>(null);
	let useCanvas = $state<boolean>(false);

	// Abort controller to cancel streaming
	let abortController: AbortController | null = null;

	// Computed: Active Conversation
	const currentConversation = $derived(
		conversations.find((c) => c.id === currentConversationId) || null
	);

	// Computed: active thinking process
	const activeThinking = $derived.by(() => {
		if (!currentConversation || currentConversation.messages.length === 0) return null;
		
		// If a specific message's thinking is selected, show that
		if (selectedThinkingMsgId) {
			const msg = currentConversation.messages.find(m => m.id === selectedThinkingMsgId);
			if (msg && msg.role === 'assistant') {
				const parsed = parseThinking(msg.content);
				if (parsed.thinking) return parsed;
			}
		}
		
		// Otherwise, search backwards for the most recent assistant message with thinking
		for (let i = currentConversation.messages.length - 1; i >= 0; i--) {
			const msg = currentConversation.messages[i];
			if (msg.role === 'assistant') {
				const parsed = parseThinking(msg.content);
				if (parsed.thinking) {
					return parsed;
				}
			}
		}
		return null;
	});

	// Switch to Thinking tab if Right Panel is already open and thinking starts
	$effect(() => {
		if (currentConversation && currentConversation.messages.length > 0) {
			const lastMsg = currentConversation.messages[currentConversation.messages.length - 1];
			if (lastMsg.role === 'assistant' && lastMsg.id !== lastOpenedThinkingMsgId) {
				const parsed = parseThinking(lastMsg.content);
				if (parsed.thinking) {
					untrack(() => {
						lastOpenedThinkingMsgId = lastMsg.id;
						if (showContextPanel) {
							rightPaneTab = 'thinking';
						}
					});
				}
			}
		}
	});

	// Auto open Sidebar on opening Project Settings
	$effect(() => {
		if (projectSettingsToOpenId) {
			untrack(() => {
				showSidebar = true;
			});
		}
	});

	// Load data from localStorage on Mount
	$effect(() => {
		untrack(() => {
			const storedUrl = localStorage.getItem('ollama_url');
			if (storedUrl) ollamaUrl = storedUrl;

			const storedGeminiKey = localStorage.getItem('gemini_api_key');
			if (storedGeminiKey) geminiApiKey = storedGeminiKey;

			const storedOllamaCloudKey = localStorage.getItem('ollama_cloud_api_key');
			if (storedOllamaCloudKey) ollamaCloudApiKey = storedOllamaCloudKey;

			const storedOllamaCloudUrl = localStorage.getItem('ollama_cloud_url');
			if (storedOllamaCloudUrl) ollamaCloudUrl = storedOllamaCloudUrl;

			const storedProviderMode = localStorage.getItem('ollama_provider_mode');
			if (storedProviderMode) {
				if (storedProviderMode === 'ollama') {
					enableOllamaLocal = true;
					enableOllamaCloud = false;
					enableGemini = false;
				} else if (storedProviderMode === 'ollama-cloud') {
					enableOllamaLocal = false;
					enableOllamaCloud = true;
					enableGemini = false;
				} else if (storedProviderMode === 'gemini') {
					enableOllamaLocal = false;
					enableOllamaCloud = false;
					enableGemini = true;
				} else if (storedProviderMode === 'all' || storedProviderMode === 'both') {
					enableOllamaLocal = true;
					enableOllamaCloud = true;
					enableGemini = true;
				}
				localStorage.removeItem('ollama_provider_mode');
			} else {
				const storedLocal = localStorage.getItem('ollama_enable_local');
				if (storedLocal !== null) enableOllamaLocal = storedLocal === 'true';
				const storedCloud = localStorage.getItem('ollama_enable_cloud');
				if (storedCloud !== null) enableOllamaCloud = storedCloud === 'true';
				const storedGemini = localStorage.getItem('ollama_enable_gemini');
				if (storedGemini !== null) enableGemini = storedGemini === 'true';
			}

			const storedChats = localStorage.getItem('ollama_conversations');
			if (storedChats) {
				try {
					conversations = JSON.parse(storedChats);
				} catch (e) {
					console.error('Failed to parse conversations from localStorage:', e);
				}
			}

			const storedActiveId = localStorage.getItem('ollama_active_id');
			if (storedActiveId && conversations.some(c => c.id === storedActiveId)) {
				currentConversationId = storedActiveId;
			} else if (conversations.length > 0) {
				currentConversationId = conversations[0].id;
			}

			const storedActiveModels = localStorage.getItem('ollama_active_models');
			if (storedActiveModels) {
				try {
					activeModels = JSON.parse(storedActiveModels);
				} catch (e) {
					console.error('Failed to parse active models from localStorage:', e);
				}
			} else {
				const storedModel = localStorage.getItem('ollama_selected_model');
				if (storedModel) {
					activeModels = [storedModel];
				}
			}

			const storedTemps = localStorage.getItem('ollama_model_temperatures');
			if (storedTemps) {
				try {
					modelTemperatures = JSON.parse(storedTemps);
				} catch (e) {
					console.error('Failed to parse model temperatures from localStorage:', e);
				}
			}

			if (activeModels[0]) {
				selectedModel = activeModels[0];
			}

			const storedTopP = localStorage.getItem('ollama_topp');
			if (storedTopP) topP = parseFloat(storedTopP);

			const storedTopK = localStorage.getItem('ollama_topk');
			if (storedTopK) topK = parseInt(storedTopK, 10);

			const storedNumCtx = localStorage.getItem('ollama_numctx');
			if (storedNumCtx) numCtx = parseInt(storedNumCtx, 10);

			const storedNumPredict = localStorage.getItem('ollama_numpredict');
			if (storedNumPredict) numPredict = parseInt(storedNumPredict, 10);

			const storedRepeatPenalty = localStorage.getItem('ollama_repeatpenalty');
			if (storedRepeatPenalty) repeatPenalty = parseFloat(storedRepeatPenalty);

			const storedCustomizeSettings = localStorage.getItem('ollama_customize_settings');
			if (storedCustomizeSettings) customizeSettings = storedCustomizeSettings === 'true';

			const storedDrafts = localStorage.getItem('ollama_drafts');
			if (storedDrafts) {
				try {
					drafts = JSON.parse(storedDrafts);
				} catch (e) {
					console.error('Failed to parse drafts from localStorage:', e);
				}
			}
			
			// Load projects
			const storedProjects = localStorage.getItem('ollama_projects');
			if (storedProjects) {
				try {
					projects = JSON.parse(storedProjects);
				} catch (e) {
					console.error('Failed to parse projects from localStorage:', e);
				}
			}

			// Load global context
			const storedGlobalContext = localStorage.getItem('ollama_global_context');
			if (storedGlobalContext) {
				globalContext = storedGlobalContext;
			}
			// Load canvas toggle preference (default: false)
			const storedUseCanvas = localStorage.getItem('use_canvas_directive');
			if (storedUseCanvas !== null) {
				useCanvas = storedUseCanvas === 'true';
			} else {
				useCanvas = false;
			}
			
			// Load initial draft for current conversation
			const activeKey = currentConversationId || 'new-chat';
			if (drafts[activeKey]) {
				input = drafts[activeKey];
			}

			// Load UI layout states
			const storedShowSidebar = localStorage.getItem('ollama_show_sidebar');
			if (storedShowSidebar !== null) {
				showSidebar = storedShowSidebar === 'true';
			}

			const storedShowContextPanel = localStorage.getItem('ollama_show_context_panel');
			if (storedShowContextPanel !== null) {
				showContextPanel = storedShowContextPanel === 'true';
			}

			const storedRightPaneTab = localStorage.getItem('ollama_right_pane_tab');
			if (storedRightPaneTab === 'context' || storedRightPaneTab === 'thinking' || storedRightPaneTab === 'canvas') {
				rightPaneTab = storedRightPaneTab;
			}

			const storedSidebarWidth = localStorage.getItem('ollama_sidebar_width');
			if (storedSidebarWidth) {
				sidebarWidth = parseInt(storedSidebarWidth, 10);
			}

			const storedContextPanelWidth = localStorage.getItem('ollama_context_panel_width');
			if (storedContextPanelWidth) {
				contextPanelWidth = parseInt(storedContextPanelWidth, 10);
			}

			const storedFontSize = localStorage.getItem('chat_font_size');
			if (storedFontSize) {
				const parsed = parseInt(storedFontSize, 10);
				if (!isNaN(parsed) && parsed >= 10 && parsed <= 30) {
					fontSize = parsed;
				}
			}

			const storedFontFamily = localStorage.getItem('chat_font_family');
			const validFonts = ['inter', 'outfit', 'lora', 'fira-code', 'system'];
			if (storedFontFamily && validFonts.includes(storedFontFamily)) {
				fontFamily = storedFontFamily;
			}

			// Load theme preference
			const storedTheme = localStorage.getItem('theme');
			const validThemes = [
				'dark-blue', 'light-blue',
				'dark-indigo', 'light-indigo',
				'dark-purple', 'light-purple',
				'dark-pink', 'light-pink',
				'dark-red', 'light-red',
				'dark-orange', 'light-orange',
				'dark-yellow', 'light-yellow',
				'dark-green', 'light-green',
				'dark-teal', 'light-teal',
				'dark-cyan', 'light-cyan',
				'dark-gray', 'light-gray'
			];
			if (storedTheme && validThemes.includes(storedTheme)) {
				theme = storedTheme;
			} else if (storedTheme === 'light') {
				theme = 'light-yellow'; // Map legacy light theme to light-yellow (sepia)
			} else if (storedTheme === 'dark') {
				theme = 'dark-blue'; // Map legacy dark theme to dark-blue (obsidian slate)
			} else {
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				theme = prefersDark ? 'dark-blue' : 'light-blue';
			}

			if (typeof window !== 'undefined') {
				(window as any).openCanvasFile = (name: string) => {
					activeCanvasFileName = name;
					showContextPanel = true;
					rightPaneTab = 'canvas';
				};
			}

			isInitialized = true;
		});
	});

	// Sync theme to document element and meta tag
	$effect(() => {
		document.documentElement.setAttribute('data-theme', theme);
		
		// Update meta color based on active theme
		let metaColor = '#131314'; // Default dark
		if (theme.startsWith('dark')) {
			if (theme.endsWith('yellow')) metaColor = '#121110';
			else if (theme.endsWith('pink')) metaColor = '#131212';
			else if (theme.endsWith('purple')) metaColor = '#121113';
			else if (theme.endsWith('green')) metaColor = '#111211';
			else if (theme.endsWith('orange')) metaColor = '#131110';
			else if (theme.endsWith('teal')) metaColor = '#101312';
			else if (theme.endsWith('red')) metaColor = '#131010';
			else if (theme.endsWith('indigo')) metaColor = '#101115';
			else if (theme.endsWith('cyan')) metaColor = '#101314';
			else if (theme.endsWith('gray')) metaColor = '#161616';
		} else {
			metaColor = '#f0f4f9'; // Default light-blue
			if (theme.endsWith('yellow')) metaColor = '#faf8f5';
			else if (theme.endsWith('pink')) metaColor = '#fdfafb';
			else if (theme.endsWith('purple')) metaColor = '#faf8fc';
			else if (theme.endsWith('green')) metaColor = '#f6faf7';
			else if (theme.endsWith('orange')) metaColor = '#fdfbfa';
			else if (theme.endsWith('teal')) metaColor = '#f5fafb';
			else if (theme.endsWith('red')) metaColor = '#fdfafb';
			else if (theme.endsWith('indigo')) metaColor = '#fafbfe';
			else if (theme.endsWith('cyan')) metaColor = '#f5fbfc';
			else if (theme.endsWith('gray')) metaColor = '#f5f5f5';
		}
		let metaEl = document.querySelector('meta[name="theme-color"]');
		if (!metaEl) {
			metaEl = document.createElement('meta');
			metaEl.setAttribute('name', 'theme-color');
			document.head.appendChild(metaEl);
		}
		metaEl.setAttribute('content', metaColor);
		localStorage.setItem('theme', theme);
	});

	// Save data to localStorage on state changes
	$effect(() => {
		localStorage.setItem('ollama_url', ollamaUrl);
	});

	$effect(() => {
		localStorage.setItem('gemini_api_key', geminiApiKey);
	});

	$effect(() => {
		localStorage.setItem('ollama_enable_local', String(enableOllamaLocal));
	});

	$effect(() => {
		localStorage.setItem('ollama_enable_cloud', String(enableOllamaCloud));
	});

	$effect(() => {
		localStorage.setItem('ollama_enable_gemini', String(enableGemini));
	});

	$effect(() => {
		if (enableOllamaLocal || enableOllamaCloud || enableGemini) {
			untrack(() => {
				const availableModels = models;
				if (availableModels.length > 0) {
					const modelNames = availableModels.map((m) => m.name);
					if (!selectedModel || !modelNames.includes(selectedModel)) {
						selectedModel = availableModels[0].name;
					}
				} else {
					selectedModel = '';
				}
			});
		}
	});

	$effect(() => {
		localStorage.setItem('ollama_cloud_api_key', ollamaCloudApiKey);
	});

	$effect(() => {
		localStorage.setItem('ollama_cloud_url', ollamaCloudUrl);
	});

	$effect(() => {
		if (!isGenerating) {
			localStorage.setItem('ollama_conversations', JSON.stringify(conversations));
		}
	});

	$effect(() => {
		if (currentConversationId) {
			localStorage.setItem('ollama_active_id', currentConversationId);
		} else {
			localStorage.removeItem('ollama_active_id');
		}
	});

	// Synchronize selectedModel and activeModels[0]
	$effect(() => {
		const firstActive = activeModels[0] || '';
		if (selectedModel !== firstActive) {
			if (activeModels[0] !== selectedModel) {
				activeModels[0] = selectedModel;
			} else {
				selectedModel = firstActive;
			}
		}
	});

	// Save active models and temperatures to localStorage
	$effect(() => {
		if (activeModels && activeModels.length > 0) {
			localStorage.setItem('ollama_active_models', JSON.stringify(activeModels));
			localStorage.setItem('ollama_selected_model', activeModels[0]);
		}
	});

	$effect(() => {
		localStorage.setItem('ollama_model_temperatures', JSON.stringify(modelTemperatures));
	});

	$effect(() => {
		localStorage.setItem('ollama_topp', String(topP));
	});

	$effect(() => {
		localStorage.setItem('ollama_topk', String(topK));
	});

	$effect(() => {
		localStorage.setItem('ollama_numctx', String(numCtx));
	});

	$effect(() => {
		localStorage.setItem('ollama_numpredict', String(numPredict));
	});

	$effect(() => {
		localStorage.setItem('ollama_repeatpenalty', String(repeatPenalty));
	});

	$effect(() => {
		localStorage.setItem('ollama_customize_settings', String(customizeSettings));
	});

	// Save drafts to localStorage with 500ms debounce
	$effect(() => {
		const dataToSave = JSON.stringify(drafts);
		const timeout = setTimeout(() => {
			localStorage.setItem('ollama_drafts', dataToSave);
		}, 500);
		return () => clearTimeout(timeout);
	});

	// Save projects to localStorage with quota protection
	$effect(() => {
		try {
			localStorage.setItem('ollama_projects', JSON.stringify(projects));
		} catch (error: any) {
			if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
				alert(`Storage Limit Exceeded!\n\nThe attached reference files are too large to fit in browser LocalStorage (limit is 5MB). Your latest project changes could not be saved.\n\nPlease open project settings and delete some files or use smaller files.`);
			} else {
				console.error('Failed to save projects to localStorage:', error);
			}
		}
	});

	// Save global context to localStorage
	$effect(() => {
		localStorage.setItem('ollama_global_context', globalContext);
	});

	// Save UI layout states to localStorage
	$effect(() => {
		if (isInitialized) {
			localStorage.setItem('ollama_show_sidebar', String(showSidebar));
		}
	});

	$effect(() => {
		if (isInitialized) {
			localStorage.setItem('ollama_show_context_panel', String(showContextPanel));
		}
	});

	$effect(() => {
		if (isInitialized) {
			localStorage.setItem('ollama_right_pane_tab', rightPaneTab);
		}
	});

	// Layout widths are saved once resizing finishes in mouseup events

	// Watch for input changes to update drafts
	$effect(() => {
		const activeKey = currentConversationId || 'new-chat';
		if (drafts[activeKey] !== input) {
			drafts[activeKey] = input;
		}
	});

	// Watch for currentConversationId changes to switch active draft
	$effect(() => {
		const activeKey = currentConversationId || 'new-chat';
		untrack(() => {
			input = drafts[activeKey] || '';
		});
	});

	// Trigger model loading whenever URL/keys change
	$effect(() => {
		if (enableOllamaLocal && ollamaUrl) {
			untrack(() => {
				loadModels();
			});
		}
	});

	$effect(() => {
		if (enableOllamaCloud && (ollamaCloudUrl || ollamaCloudApiKey)) {
			untrack(() => {
				loadCloudModels();
			});
		}
	});

	function autoSelectModel() {
		const availableModels = models;
		if (availableModels.length > 0) {
			const modelNames = availableModels.map((m) => m.name);
			if (!selectedModel || !modelNames.includes(selectedModel)) {
				selectedModel = availableModels[0].name;
			}
		} else {
			selectedModel = '';
		}
	}

	// Fetch models from Ollama Cloud
	async function loadCloudModels() {
		if (typeof window === 'undefined') return;
		if (!ollamaCloudApiKey.trim()) {
			ollamaCloudModels = [];
			isOllamaCloudConnected = false;
			return;
		}
		try {
			const fetchedModels = await fetchModels(ollamaCloudUrl, ollamaCloudApiKey);
			fetchedModels.sort((a, b) => a.name.localeCompare(b.name));
			ollamaCloudModels = fetchedModels;
			isOllamaCloudConnected = true;
			autoSelectModel();
		} catch (error) {
			console.error('Ollama Cloud connection failed:', error);
			ollamaCloudModels = [];
			isOllamaCloudConnected = false;
			autoSelectModel();
		}
	}

	// Fetch models from Ollama
	async function loadModels() {
		if (typeof window === 'undefined') return;
		try {
			const fetchedModels = await fetchModels(ollamaUrl);
			fetchedModels.sort((a, b) => a.name.localeCompare(b.name));
			ollamaModels = fetchedModels;
			isConnected = true;
			autoSelectModel();
		} catch (error) {
			console.error('Ollama connection failed:', error);
			ollamaModels = [];
			isConnected = false;
			autoSelectModel();
		}
	}

	// Create a new conversation
	function handleNewConversation() {
		// If there is already an empty conversation, just select it instead of creating a duplicate
		const emptyConv = conversations.find(c => c.messages.length === 0 && !c.projectId);
		if (emptyConv) {
			currentConversationId = emptyConv.id;
			return;
		}

		const newConv: Conversation = {
			id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			title: 'New Conversation',
			messages: [],
			createdAt: Date.now(),
			model: selectedModel
		};

		conversations = [newConv, ...conversations];
		currentConversationId = newConv.id;
	}

	// Delete a conversation
	function handleDeleteConversation(id: string) {
		conversations = conversations.filter((c) => c.id !== id);
		
		if (currentConversationId === id) {
			if (conversations.length > 0) {
				currentConversationId = conversations[0].id;
			} else {
				currentConversationId = null;
			}
		}
	}

	// Update conversation title
	function handleUpdateTitle(id: string, newTitle: string) {
		conversations = conversations.map((c) => {
			if (c.id === id) {
				return { ...c, title: newTitle };
			}
			return c;
		});
	}

	// Select a conversation
	function handleSelectConversation(id: string) {
		currentConversationId = id;
		selectedThinkingMsgId = null;
	}

	// Stop assistant generation
	function handleStopGeneration() {
		if (abortController) {
			abortController.abort();
			isGenerating = false;
		}
	}

	// Project operations
	function handleCreateProject(name: string, context: string = '', files: ProjectFile[] = []) {
		const newProject: Project = {
			id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			name,
			context,
			files,
			createdAt: Date.now()
		};
		projects = [...projects, newProject];
	}

	// Update project name, context, and files
	function handleUpdateProject(id: string, name: string, context: string, files: ProjectFile[] = []) {
		projects = projects.map((p) => (p.id === id ? { ...p, name, context, files } : p));
	}

	// Delete project and handle chats
	function handleDeleteProject(id: string, deleteChats: boolean) {
		projects = projects.filter((p) => p.id !== id);
		if (deleteChats) {
			conversations = conversations.filter((c) => c.projectId !== id);
			if (currentConversationId && !conversations.some((c) => c.id === currentConversationId)) {
				currentConversationId = conversations.length > 0 ? conversations[0].id : null;
			}
		} else {
			conversations = conversations.map((c) => (c.projectId === id ? { ...c, projectId: undefined } : c));
		}
	}

	// Create new chat inside a specific project
	function handleNewConversationInProject(projectId: string) {
		const emptyConv = conversations.find(c => c.messages.length === 0 && c.projectId === projectId);
		if (emptyConv) {
			currentConversationId = emptyConv.id;
			return;
		}

		const newConv: Conversation = {
			id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			title: 'New Conversation',
			messages: [],
			createdAt: Date.now(),
			model: selectedModel,
			projectId
		};
		conversations = [newConv, ...conversations];
		currentConversationId = newConv.id;
	}

	// Update chat-level context
	function handleUpdateChatContext(chatId: string, context: string) {
		conversations = conversations.map((c) => (c.id === chatId ? { ...c, context } : c));
	}

	// Update chat-level project assignment
	function handleUpdateChatProject(chatId: string, projectId: string | undefined) {
		conversations = conversations.map((c) => (c.id === chatId ? { ...c, projectId } : c));
	}

	// Extract files from message and save them to IndexedDB
	async function saveCanvasFilesFromMessage(chatId: string, content: string) {
		const extracted = parseCanvasTags(content);
		if (extracted.length === 0) return;

		for (const file of extracted) {
			await db.canvasFiles.put({
				chatId,
				name: file.name,
				type: file.type,
				content: file.content,
				updatedAt: Date.now()
			});
		}
	}

	// Build combined system prompt from Global + Project + Chat levels + Canvas files
	async function getCombinedSystemPrompt(conv: Conversation | null): Promise<string> {
		if (!conv) return '';
		const parts: string[] = [];

		if (globalContext?.trim()) {
			parts.push(`[Global Context]:\n${globalContext.trim()}`);
		}

		if (conv.projectId) {
			const project = projects.find((p) => p.id === conv.projectId);
			if (project) {
				let projectPrompt = '';
				if (project.context?.trim()) {
					projectPrompt += `[Project Context - ${project.name}]:\n${project.context.trim()}`;
				}
				
				// Inject file contents if present
				if (project.files && project.files.length > 0) {
					if (projectPrompt) projectPrompt += '\n\n';
					projectPrompt += `[Project Reference Files - ${project.name}]:\n`;
					projectPrompt += `CRITICAL DIRECTIVE: You must use the following files as your primary reference and knowledge source for all your answers in this conversation. If there are any differences between these files and your pre-trained knowledge (e.g. Svelte 5 runes syntax vs older versions), you MUST prioritize the information and syntax described in these files:`;
					for (const file of project.files) {
						projectPrompt += `\n\nFile "${file.name}":\n\`\`\`\n${file.content}\n\`\`\``;
					}
				}
				
				if (projectPrompt) {
					parts.push(projectPrompt);
				}
			}
		}

		if (conv.context?.trim()) {
			parts.push(`[Chat Context]:\n${conv.context.trim()}`);
		}

		// Inject Canvas Files (Artifacts) from IndexedDB
		const canvasFiles = await db.canvasFiles.where({ chatId: conv.id }).toArray();
		if (canvasFiles.length > 0) {
			let canvasPrompt = `[Active Canvas Files (Artifacts) in this Chat]:\nThese are files that you or the user have created/modified in the interactive Canvas. You can reference, reuse, or update these files.\n`;
			for (const file of canvasFiles) {
				canvasPrompt += `\nFile "${file.name}" (${file.type}):\n\`\`\`\n${file.content}\n\`\`\``;
			}
			parts.push(canvasPrompt);
		}

		// Append critical canvas syntax instructions for the AI
		if (useCanvas) {
			parts.push(`[CRITICAL CANVAS DIRECTIVE]: You have access to an interactive Workspace (Canvas) on the right side of the screen. You can display/modify documents, source code, or HTML pages for the user. To create a new file or modify an existing file, you MUST wrap the complete, updated content of the file inside a <canvas name="filename.ext" type="html|markdown|code|text">...</canvas> tag block. Do not write explanations inside the <canvas> block itself, only the exact file contents. The system will extract it and display it in the Canvas panel on the right. For HTML pages, ensure they are self-contained and run standalone.`);
		}

		// Enforce language alignment to match the user's language (specifically Thai if the user asks in Thai)
		parts.push(`[LANGUAGE INSTRUCTION]: Always respond in the language used by the user. If the user prompts in Thai (ภาษาไทย), you must write all your responses, explanations, and code comments in Thai. Do not output in other languages such as Korean or English unless referencing technical keywords.`);

		const combined = parts.join('\n\n');
		console.log('[System Context Debug] Calculated System Prompt:', combined);
		return combined;
	}

	// Execute multi-model chain sequentially
	async function executeModelChain(
		activeConvId: string,
		assistantMsgId: string,
		initialMessages: Message[],
		systemPrompt: string
	) {
		const chainLength = activeModels.length;
		let currentPrompt = initialMessages[initialMessages.length - 1]?.content || '';

		const appendToAssistantMessage = (text: string) => {
			conversations = conversations.map((conv) => {
				if (conv.id === activeConvId) {
					return {
						...conv,
						messages: conv.messages.map((m) => {
							if (m.id === assistantMsgId) {
								const newContent = m.content + text;
								
								// Asynchronously extract and save canvas files to IndexedDB as they stream
								const extracted = parseCanvasTags(newContent);
								if (extracted.length > 0) {
									extracted.forEach((file) => {
										db.canvasFiles.put({
											chatId: activeConvId,
											name: file.name,
											type: file.type,
											content: file.content,
											updatedAt: Date.now()
										});
									});

									// Automatically open and switch to Canvas if not opened yet
									if (!activeCanvasFileName) {
										activeCanvasFileName = extracted[0].name;
										showContextPanel = true;
										rightPaneTab = 'canvas';
									}
								}
								
								return { ...m, content: newContent };
							}
							return m;
						})
					};
				}
				return conv;
			});
		};

		const setAssistantMessageModel = (modelName: string) => {
			conversations = conversations.map((conv) => {
				if (conv.id === activeConvId) {
					return {
						...conv,
						messages: conv.messages.map((m) => {
							if (m.id === assistantMsgId) {
								return { ...m, model: modelName };
							}
							return m;
						})
					};
				}
				return conv;
			});
		};

		try {
			if (chainLength === 1 || !activeModels[1]) {
				// Normal mode (1 model)
				const model = activeModels[0] || selectedModel;
				const temp = modelTemperatures[0] !== undefined ? modelTemperatures[0] : 0.7;
				setAssistantMessageModel(model);

				const isCloudModel = ollamaCloudModels.some(m => m.name === model);
				const targetUrl = isCloudModel ? ollamaCloudUrl : ollamaUrl;
				const targetApiKey = isCloudModel ? ollamaCloudApiKey : undefined;

				await streamChat(
					{
						messages: initialMessages,
						model,
						systemPrompt,
						ollamaUrl: targetUrl,
						ollamaApiKey: targetApiKey,
						temperature: temp,
						topP,
						topK,
						numCtx,
						numPredict,
						repeatPenalty,
						customizeSettings
					},
					(chunk) => appendToAssistantMessage(chunk),
					() => {},
					(err) => { throw err; },
					abortController?.signal
				);
			} else if (chainLength === 2 || !activeModels[2]) {
				// 2-Model mode: Model 1 (Translator/Refiner) -> Model 2 (Executor)
				const m1 = activeModels[0];
				const temp1 = modelTemperatures[0] !== undefined ? modelTemperatures[0] : 0.7;
				const m2 = activeModels[1];
				const temp2 = modelTemperatures[1] !== undefined ? modelTemperatures[1] : 0.2;

				// Step 1: Model 1
				setAssistantMessageModel(m1);
				appendToAssistantMessage(`<think>\n[Step 1: Translating/Refining Prompt with ${m1}]\n`);
				
				const isCloudM1 = ollamaCloudModels.some(m => m.name === m1);
				const targetUrlM1 = isCloudM1 ? ollamaCloudUrl : ollamaUrl;
				const targetApiKeyM1 = isCloudM1 ? ollamaCloudApiKey : undefined;

				let m1FullResponse = '';
				await streamChat(
					{
						messages: [
							{
								id: `m1-sys-${Date.now()}`,
								role: 'system',
								content: 'You are a professional prompt refiner and translator.\nTranslate the user\'s prompt to English if it is in Thai or another language.\nRefine and expand the prompt to make it clear, detailed, and optimized for an AI developer/assistant.\nPreserve all context, instructions, and reference attachments.\nOutput ONLY the refined English prompt. Do not add any conversational text, pleasantries, or explanations.',
								timestamp: Date.now()
							},
							{
								id: `m1-user-${Date.now()}`,
								role: 'user',
								content: currentPrompt,
								timestamp: Date.now()
							}
						],
						model: m1,
						ollamaUrl: targetUrlM1,
						ollamaApiKey: targetApiKeyM1,
						temperature: temp1,
						topP,
						topK,
						numCtx,
						numPredict,
						repeatPenalty,
						customizeSettings
					},
					(chunk) => {
						const cleanChunk = chunk.replace(/<\/?think>/g, '');
						m1FullResponse += cleanChunk;
						appendToAssistantMessage(cleanChunk);
					},
					() => {},
					(err) => { throw err; },
					abortController?.signal
				);
				appendToAssistantMessage('\n</think>\n');

				if (abortController?.signal.aborted) {
					throw new DOMException('The user aborted a request.', 'AbortError');
				}

				const parsedM1 = parseThinking(m1FullResponse);
				const refinedPrompt = parsedM1.response.trim() || m1FullResponse.trim();

				// Step 2: Model 2 (Final Model)
				setAssistantMessageModel(`${m1} ➔ ${m2}`);

				const m2Messages = [...initialMessages];
				if (m2Messages.length > 0) {
					m2Messages[m2Messages.length - 1] = {
						...m2Messages[m2Messages.length - 1],
						content: refinedPrompt
					};
				}

				const isCloudM2 = ollamaCloudModels.some(m => m.name === m2);
				const targetUrlM2 = isCloudM2 ? ollamaCloudUrl : ollamaUrl;
				const targetApiKeyM2 = isCloudM2 ? ollamaCloudApiKey : undefined;

				await streamChat(
					{
						messages: m2Messages,
						model: m2,
						systemPrompt,
						ollamaUrl: targetUrlM2,
						ollamaApiKey: targetApiKeyM2,
						temperature: temp2,
						topP,
						topK,
						numCtx,
						numPredict,
						repeatPenalty,
						customizeSettings
					},
					(chunk) => appendToAssistantMessage(chunk),
					() => {},
					(err) => { throw err; },
					abortController?.signal
				);

			} else {
				// 3-Model mode: Model 1 (Refiner) -> Model 2 (Executor) -> Model 3 (Translator)
				const m1 = activeModels[0];
				const temp1 = modelTemperatures[0] !== undefined ? modelTemperatures[0] : 0.7;
				const m2 = activeModels[1];
				const temp2 = modelTemperatures[1] !== undefined ? modelTemperatures[1] : 0.2;
				const m3 = activeModels[2];
				const temp3 = modelTemperatures[2] !== undefined ? modelTemperatures[2] : 0.7;

				// Step 1: Model 1
				setAssistantMessageModel(m1);
				appendToAssistantMessage(`<think>\n[Step 1: Translating/Refining Prompt with ${m1}]\n`);
				
				const isCloudM1 = ollamaCloudModels.some(m => m.name === m1);
				const targetUrlM1 = isCloudM1 ? ollamaCloudUrl : ollamaUrl;
				const targetApiKeyM1 = isCloudM1 ? ollamaCloudApiKey : undefined;

				let m1FullResponse = '';
				await streamChat(
					{
						messages: [
							{
								id: `m1-sys-${Date.now()}`,
								role: 'system',
								content: 'You are a professional prompt refiner and translator.\nTranslate the user\'s prompt to English if it is in Thai or another language.\nRefine and expand the prompt to make it clear, detailed, and optimized for an AI developer/assistant.\nPreserve all context, instructions, and reference attachments.\nOutput ONLY the refined English prompt. Do not add any conversational text, pleasantries, or explanations.',
								timestamp: Date.now()
							},
							{
								id: `m1-user-${Date.now()}`,
								role: 'user',
								content: currentPrompt,
								timestamp: Date.now()
							}
						],
						model: m1,
						ollamaUrl: targetUrlM1,
						ollamaApiKey: targetApiKeyM1,
						temperature: temp1,
						topP,
						topK,
						numCtx,
						numPredict,
						repeatPenalty,
						customizeSettings
					},
					(chunk) => {
						const cleanChunk = chunk.replace(/<\/?think>/g, '');
						m1FullResponse += cleanChunk;
						appendToAssistantMessage(cleanChunk);
					},
					() => {},
					(err) => { throw err; },
					abortController?.signal
				);
				appendToAssistantMessage('\n</think>\n');

				if (abortController?.signal.aborted) {
					throw new DOMException('The user aborted a request.', 'AbortError');
				}

				const parsedM1 = parseThinking(m1FullResponse);
				const refinedPrompt = parsedM1.response.trim() || m1FullResponse.trim();

				// Step 2: Model 2 (Intermediate Executor)
				setAssistantMessageModel(`${m1} ➔ ${m2}`);
				appendToAssistantMessage(`<think>\n[Step 2: Generating Solution in English with ${m2}]\n`);

				const m2Messages = [...initialMessages];
				if (m2Messages.length > 0) {
					m2Messages[m2Messages.length - 1] = {
						...m2Messages[m2Messages.length - 1],
						content: refinedPrompt
					};
				}

				const isCloudM2 = ollamaCloudModels.some(m => m.name === m2);
				const targetUrlM2 = isCloudM2 ? ollamaCloudUrl : ollamaUrl;
				const targetApiKeyM2 = isCloudM2 ? ollamaCloudApiKey : undefined;

				let m2FullResponse = '';
				await streamChat(
					{
						messages: m2Messages,
						model: m2,
						systemPrompt,
						ollamaUrl: targetUrlM2,
						ollamaApiKey: targetApiKeyM2,
						temperature: temp2,
						topP,
						topK,
						numCtx,
						numPredict,
						repeatPenalty,
						customizeSettings
					},
					(chunk) => {
						const cleanChunk = chunk.replace(/<\/?think>/g, '');
						m2FullResponse += cleanChunk;
						appendToAssistantMessage(cleanChunk);
					},
					() => {},
					(err) => { throw err; },
					abortController?.signal
				);
				appendToAssistantMessage('\n</think>\n');

				if (abortController?.signal.aborted) {
					throw new DOMException('The user aborted a request.', 'AbortError');
				}

				const parsedM2 = parseThinking(m2FullResponse);
				const englishSolution = parsedM2.response.trim() || m2FullResponse.trim();

				// Step 3: Model 3 (Final Translator)
				setAssistantMessageModel(`${m1} ➔ ${m2} ➔ ${m3}`);

				const isCloudM3 = ollamaCloudModels.some(m => m.name === m3);
				const targetUrlM3 = isCloudM3 ? ollamaCloudUrl : ollamaUrl;
				const targetApiKeyM3 = isCloudM3 ? ollamaCloudApiKey : undefined;

				await streamChat(
					{
						messages: [
							{
								id: `m3-sys-${Date.now()}`,
								role: 'system',
								content: 'You are a professional translator and editor.\nTranslate the following English response into natural, fluent Thai.\nEnsure all technical terms, code blocks, and markdown formatting are preserved exactly as they are.\nOutput ONLY the translated Thai response. Do not add any extra explanations, introduction, or pleasantries.',
								timestamp: Date.now()
							},
							{
								id: `m3-user-${Date.now()}`,
								role: 'user',
								content: englishSolution,
								timestamp: Date.now()
							}
						],
						model: m3,
						ollamaUrl: targetUrlM3,
						ollamaApiKey: targetApiKeyM3,
						temperature: temp3,
						topP,
						topK,
						numCtx,
						numPredict,
						repeatPenalty,
						customizeSettings
					},
					(chunk) => appendToAssistantMessage(chunk),
					() => {},
					(err) => { throw err; },
					abortController?.signal
				);
			}

			// After finishing execution chain, extract and save canvas files
			const activeConv = conversations.find(c => c.id === activeConvId);
			const finalMsg = activeConv?.messages.find(m => m.id === assistantMsgId);
			if (finalMsg && finalMsg.content) {
				await saveCanvasFilesFromMessage(activeConvId, finalMsg.content);
				
				// Automatically switch tab and open the first newly generated/updated canvas file
				const extracted = parseCanvasTags(finalMsg.content);
				if (extracted.length > 0) {
					activeCanvasFileName = extracted[0].name;
					showContextPanel = true;
					rightPaneTab = 'canvas';
				}
			}

			isGenerating = false;
			abortController = null;
		} catch (error: any) {
			if (error.name === 'AbortError' || error.message?.includes('aborted')) {
				isGenerating = false;
				abortController = null;
				return;
			}
			console.error('Error during execution chain:', error);
			conversations = conversations.map((conv) => {
				if (conv.id === activeConvId) {
					return {
						...conv,
						messages: conv.messages.map((m) => {
							if (m.id === assistantMsgId) {
								return {
									...m,
									content: m.content + `\n\n**Error during model execution:** _${error.message}_`
								};
							}
							return m;
						})
					};
				}
				return conv;
			});
			isGenerating = false;
			abortController = null;
		}
	}

	// Send message to assistant
	async function handleSendPrompt(promptText: string = input) {
		selectedThinkingMsgId = null;
		const cleanPrompt = promptText.trim();
		if ((!cleanPrompt && attachments.length === 0) || !selectedModel) return;

		// 1. Ensure there is an active conversation, create one if not
		let activeConvId = currentConversationId;
		const titleBase = cleanPrompt || (attachments.length > 0 ? attachments[0].name : 'New Conversation');
		if (!activeConvId) {
			const newConv: Conversation = {
				id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				title: titleBase.slice(0, 30) + (titleBase.length > 30 ? '...' : ''),
				messages: [],
				createdAt: Date.now(),
				model: selectedModel
			};
			conversations = [newConv, ...conversations];
			activeConvId = newConv.id;
			currentConversationId = activeConvId;
		}

		const msgAttachments = [...attachments];
		const msgImages = attachments.filter(a => a.type === 'image').map(a => a.content);

		const userMessage: Message = {
			id: `msg-${Date.now()}-user`,
			role: 'user',
			content: cleanPrompt,
			timestamp: Date.now(),
			images: msgImages.length > 0 ? msgImages : undefined,
			attachments: msgAttachments.length > 0 ? msgAttachments : undefined
		};

		// Clear active attachments
		attachments = [];

		// 2. Add user message to conversation
		conversations = conversations.map((conv) => {
			if (conv.id === activeConvId) {
				// If default title, update title based on first prompt
				const title = conv.title === 'New Conversation' 
					? titleBase.slice(0, 30) + (titleBase.length > 30 ? '...' : '')
					: conv.title;
				return {
					...conv,
					title,
					messages: [...conv.messages, userMessage],
					model: selectedModel
				};
			}
			return conv;
		});

		// Reset input textarea if sending current input
		if (promptText === input) {
			input = '';
		}

		isGenerating = true;
		abortController = new AbortController();

		// Create placeholder for assistant response
		const assistantMsgId = `msg-${Date.now()}-assistant`;
		const assistantMessage: Message = {
			id: assistantMsgId,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			model: selectedModel
		};

		conversations = conversations.map((conv) => {
			if (conv.id === activeConvId) {
				return {
					...conv,
					messages: [...conv.messages, assistantMessage]
				};
			}
			return conv;
		});

		// 3. Initiate streaming
		const activeConv = conversations.find(c => c.id === activeConvId);
		const systemPrompt = await getCombinedSystemPrompt(activeConv || null);
		await executeModelChain(
			activeConvId,
			assistantMsgId,
			activeConv?.messages.slice(0, -1) || [],
			systemPrompt
		);
	}

	// Resubmit prompt from a specific state (without appending a duplicate user message)
	async function handleResubmit(activeConvId: string) {
		selectedThinkingMsgId = null;
		// Stop any current generation first
		handleStopGeneration();

		isGenerating = true;
		abortController = new AbortController();

		// Create placeholder for assistant response
		const assistantMsgId = `msg-${Date.now()}-assistant`;
		const assistantMessage: Message = {
			id: assistantMsgId,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			model: selectedModel
		};

		conversations = conversations.map((conv) => {
			if (conv.id === activeConvId) {
				return {
					...conv,
					messages: [...conv.messages, assistantMessage]
				};
			}
			return conv;
		});

		// Initiate streaming
		const conv = conversations.find(c => c.id === activeConvId);
		const systemPrompt = await getCombinedSystemPrompt(conv || null);
		await executeModelChain(
			activeConvId,
			assistantMsgId,
			conv?.messages.slice(0, -1) || [],
			systemPrompt
		);
	}

	async function handleEditPrompt(messageId: string, newContent: string) {
		const activeConvId = currentConversationId;
		if (!activeConvId || !currentConversation) return;

		const msgIndex = currentConversation.messages.findIndex((m) => m.id === messageId);
		if (msgIndex === -1) return;

		// Slice messages up to (but not including) the user message
		const slicedMessages = currentConversation.messages.slice(0, msgIndex);
		
		const updatedUserMessage: Message = {
			...currentConversation.messages[msgIndex],
			content: newContent,
			timestamp: Date.now()
		};

		// Update conversations state
		conversations = conversations.map((conv) => {
			if (conv.id === activeConvId) {
				return {
					...conv,
					messages: [...slicedMessages, updatedUserMessage]
				};
			}
			return conv;
		});

		// Trigger resubmit for the conversation
		await handleResubmit(activeConvId);
	}

	function handleMouseDownLeft(e: MouseEvent) {
		e.preventDefault();
		isResizingLeft = true;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		
		const handleMouseMove = (moveEvent: MouseEvent) => {
			if (!isResizingLeft) return;
			// Constrain left pane width between 180px and 600px
			const newWidth = Math.max(180, Math.min(600, moveEvent.clientX));
			sidebarWidth = newWidth;
		};
		
		const handleMouseUp = () => {
			isResizingLeft = false;
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			localStorage.setItem('ollama_sidebar_width', String(sidebarWidth));
		};
		
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseDownRight(e: MouseEvent) {
		e.preventDefault();
		isResizingRight = true;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		
		const handleMouseMove = (moveEvent: MouseEvent) => {
			if (!isResizingRight) return;
			// Constrain right pane width between 250px and almost full screen (leave 100px)
			const newWidth = Math.max(250, Math.min(window.innerWidth - 100, window.innerWidth - moveEvent.clientX));
			contextPanelWidth = newWidth;
		};
		
		const handleMouseUp = () => {
			isResizingRight = false;
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			localStorage.setItem('ollama_context_panel_width', String(contextPanelWidth));
		};
		
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}
</script>

<div 
	id="app"
	class="app-layout"
	class:resizing-left={isResizingLeft}
	class:resizing-right={isResizingRight}
	style="
		--sidebar-width: {showSidebar ? sidebarWidth : 0}px;
		--sidebar-border: {showSidebar ? '1px solid var(--border-color)' : 'none'};
		--sidebar-transform: {showSidebar ? '0' : '-100%'};
		--context-panel-width: {showContextPanel ? contextPanelWidth : 0}px;
		--chat-font-size: {fontSize}px;
		--chat-font-family: {getFontFamilyCss(fontFamily)};
	"
>
	{#if showSidebar}
		<!-- Mobile Sidebar Backdrop -->
		<div class="sidebar-backdrop" onclick={() => showSidebar = false} role="presentation"></div>
	{/if}

	<!-- Sidebar -->
	<Sidebar 
		{conversations}
		{currentConversationId}
		{projects}
		{geminiApiKey}
		{enableOllamaLocal}
		{enableOllamaCloud}
		{enableGemini}
		{isConnected}
		{isOllamaCloudConnected}
		onSelectConversation={handleSelectConversation}
		onNewConversation={handleNewConversation}
		onDeleteConversation={handleDeleteConversation}
		onUpdateTitle={handleUpdateTitle}
		onCreateProject={handleCreateProject}
		onUpdateProject={handleUpdateProject}
		onDeleteProject={handleDeleteProject}
		onNewConversationInProject={handleNewConversationInProject}
		bind:projectSettingsToOpenId
		bind:isSettingsOpen
	/>

	{#if showSidebar}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div 
			class="resizer-bar left-resizer" 
			role="separator"
			aria-label="Sidebar Resizer"
			onmousedown={handleMouseDownLeft}
		></div>
	{/if}

	<!-- Main Chat Area -->
	<main class="main-content">
		<ChatArea 
			bind:fontSize={fontSize}
			bind:fontFamily={fontFamily}
			conversation={currentConversation}
			{isGenerating}
			{isInitialized}
			{showContextPanel}
			{showSidebar}
			{theme}
			{projects}
			{conversations}
			onSelectConversation={handleSelectConversation}
			onToggleTheme={handleToggleTheme}
			onSelectColor={handleSelectColor}
			onToggleSidebar={() => showSidebar = !showSidebar}
			onSendPrompt={handleSendPrompt}
			onEditPrompt={handleEditPrompt}
			onStopGeneration={handleStopGeneration}
			onToggleContextPanel={() => showContextPanel = !showContextPanel}
			onOpenThinking={() => {
				showContextPanel = true;
				rightPaneTab = 'thinking';
			}}
			onOpenCanvasFile={(name) => {
				activeCanvasFileName = name;
				showContextPanel = true;
				rightPaneTab = 'canvas';
			}}
		/>

		<!-- Input Area at the bottom -->
		<InputArea 
			bind:input
			{models}
			bind:selectedModel
			{activeModels}
			onModelPillClick={() => {
				showSidebar = true;
				isSettingsOpen = true;
			}}
			bind:attachments
			{isGenerating}
			bind:useCanvas
			onSend={() => handleSendPrompt()}
			onStop={handleStopGeneration}
		/>
	</main>

	{#if showContextPanel}
		<!-- Mobile Context Panel Backdrop -->
		<div class="context-panel-backdrop" onclick={() => showContextPanel = false} role="presentation"></div>

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div 
			class="resizer-bar right-resizer" 
			role="separator"
			aria-label="Context Panel Resizer"
			onmousedown={handleMouseDownRight}
		></div>

		<ContextPanel 
			conversation={currentConversation}
			{projects}
			{globalContext}
			{activeThinking}
			activeTab={rightPaneTab}
			{isGenerating}
			activeCanvasFileName={activeCanvasFileName}
			onChangeActiveCanvasFile={(name) => activeCanvasFileName = name}
			onChangeTab={(tab) => rightPaneTab = tab}
			onUpdateChatContext={handleUpdateChatContext}
			onUpdateChatProject={handleUpdateChatProject}
			onEditProjectSettings={(projectId) => {
				projectSettingsToOpenId = projectId;
			}}
			onClose={() => showContextPanel = false}
		/>
	{/if}

	<SettingsModal
		bind:isSettingsOpen
		bind:ollamaUrl
		bind:ollamaCloudUrl
		bind:ollamaCloudApiKey
		bind:geminiApiKey
		bind:enableOllamaLocal
		bind:enableOllamaCloud
		bind:enableGemini
		bind:activeModels
		bind:modelTemperatures
		bind:topP
		bind:topK
		bind:numCtx
		bind:numPredict
		bind:repeatPenalty
		bind:customizeSettings
		bind:globalContext
		{isConnected}
		{isOllamaCloudConnected}
		{models}
		onRefreshModels={() => { loadModels(); loadCloudModels(); }}
	/>
</div>

<style>
	.app-layout {
		display: flex;
		width: 100vw;
		height: 100vh;
		height: 100dvh;
		background-color: var(--bg-primary);
		overflow: hidden;
		position: relative;
		--font-main: var(--chat-font-family, 'Inter', system-ui, -apple-system, sans-serif);
		--font-title: var(--chat-font-family, 'Outfit', var(--font-main));
	}

	.main-content {
		flex: 1;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Resizer styling */
	.resizer-bar {
		width: 4px;
		cursor: col-resize;
		background-color: transparent;
		transition: background-color var(--transition-fast);
		z-index: 20;
		flex-shrink: 0;
	}

	.left-resizer {
		margin-left: -2px;
		margin-right: -2px;
	}

	.right-resizer {
		margin-left: -2px;
		margin-right: -2px;
	}

	.resizer-bar:hover,
	.app-layout.resizing-left .left-resizer,
	.app-layout.resizing-right .right-resizer {
		background-color: var(--accent-blue);
		box-shadow: 0 0 4px rgba(168, 199, 250, 0.4);
	}

	/* Global overrides for Sidebar border when collapsed */
	:global(.sidebar) {
		border-right: var(--sidebar-border, 1px solid var(--border-color)) !important;
	}

	/* Backdrops for mobile overlay */
	.sidebar-backdrop,
	.context-panel-backdrop {
		display: none;
	}

	@media (max-width: 768px) {
		.app-layout {
			flex-direction: column;
		}

		.resizer-bar {
			display: none !important;
		}

		.sidebar-backdrop {
			display: block;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background-color: rgba(0, 0, 0, 0.6);
			backdrop-filter: blur(2px);
			z-index: 9;
		}

		.context-panel-backdrop {
			display: block;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background-color: rgba(0, 0, 0, 0.6);
			backdrop-filter: blur(2px);
			z-index: 8;
		}

		:global(.sidebar) {
			position: absolute !important;
			left: 0;
			top: 0;
			bottom: 0;
			z-index: 10;
			width: 280px !important;
			max-width: 80% !important;
			box-shadow: var(--shadow-lg);
			transform: translateX(var(--sidebar-transform, 0));
			transition: transform var(--transition-normal);
		}

		:global(.context-panel) {
			position: absolute !important;
			right: 0;
			top: 0;
			bottom: 0;
			z-index: 10;
			width: 320px !important;
			max-width: 85% !important;
			box-shadow: var(--shadow-lg);
		}
	}
</style>
