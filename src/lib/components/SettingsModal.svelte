<script lang="ts">
	import type { OllamaModel, Conversation, Project } from '$lib/types';
	import { fade, scale } from 'svelte/transition';
	import { db } from '$lib/db';

	let {
		isSettingsOpen = $bindable(false),
		ollamaUrl = $bindable(),
		ollamaCloudUrl = $bindable(),
		ollamaCloudApiKey = $bindable(),
		geminiApiKey = $bindable(),
		enableOllamaLocal = $bindable(),
		enableOllamaCloud = $bindable(),
		enableGemini = $bindable(),
		enableWorkspaceBridge = $bindable(),
		workspaceBridgeUrl = $bindable(),
		activeModels = $bindable(),
		modelTemperatures = $bindable(),
		topP = $bindable(),
		topK = $bindable(),
		numCtx = $bindable(),
		numPredict = $bindable(),
		repeatPenalty = $bindable(),
		customizeSettings = $bindable(),
		globalContext = $bindable(),
		conversations = $bindable([]),
		projects = $bindable([]),
		isConnected = false,
		isOllamaCloudConnected = false,
		models = [],
		onRefreshModels
	} = $props<{
		isSettingsOpen: boolean;
		ollamaUrl: string;
		ollamaCloudUrl: string;
		ollamaCloudApiKey: string;
		geminiApiKey: string;
		enableOllamaLocal: boolean;
		enableOllamaCloud: boolean;
		enableGemini: boolean;
		enableWorkspaceBridge: boolean;
		workspaceBridgeUrl: string;
		activeModels: string[];
		modelTemperatures: number[];
		topP: number;
		topK: number;
		numCtx: number;
		numPredict: number;
		repeatPenalty: number;
		customizeSettings: boolean;
		globalContext: string;
		conversations: Conversation[];
		projects: Project[];
		isConnected: boolean;
		isOllamaCloudConnected: boolean;
		models: (OllamaModel & { source?: 'local' | 'cloud' | 'gemini' })[];
		onRefreshModels: () => void;
	}>();

	import { fetchModels } from '$lib/ollama';
	import { roleStore } from '$lib/roleStore.svelte';

	let activeTab = $state<'connections' | 'chain' | 'advanced' | 'context' | 'storage' | 'roles' | 'models'>('connections');
	let selectedConnectionTab = $state<'local' | 'cloud' | 'gemini' | 'workspace_bridge'>('local');
	let showOllamaCloudKey = $state(false);
	let showWorkspaceBridge = $state(false); // accordion for workspace bridge (developer tool)
	let showSystemRoles = $state(false); // collapse system roles by default
	let mousedownTarget: EventTarget | null = null;

	let localEnableWorkspaceBridge = $state(enableWorkspaceBridge);
	let testingWorkspaceBridge = $state(false);
	let localStatusWorkspaceBridge = $state<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

	// Custom Role States
	let editingRoleId = $state<string | null>(null); // 'new', role.id, or null
	let roleFormName = $state('');
	let roleFormIcon = $state('🤖');
	let roleFormDesc = $state('');
	let roleFormPrompt = $state('');
	let roleFormKeywords = $state('');

	function openNewRoleForm() {
		editingRoleId = 'new';
		roleFormName = '';
		roleFormIcon = '🤖';
		roleFormDesc = '';
		roleFormPrompt = '';
		roleFormKeywords = '';
	}

	function handleEditRole(role: any) {
		editingRoleId = role.id;
		roleFormName = role.name;
		roleFormIcon = role.icon || '🤖';
		roleFormDesc = role.desc || '';
		roleFormPrompt = role.prompt || '';
		roleFormKeywords = role.keywords || '';
	}

	function handleDuplicateRole(role: any) {
		editingRoleId = 'new';
		roleFormName = `${role.name} Copy`;
		roleFormIcon = role.icon || '🤖';
		roleFormDesc = role.desc || '';
		roleFormPrompt = role.prompt || '';
		roleFormKeywords = role.keywords || '';
	}

	async function saveRole() {
		if (!roleFormName.trim() || !roleFormPrompt.trim()) {
			alert('กรุณากรอกชื่อบทบาทและ System Prompt');
			return;
		}

		const roleId = editingRoleId === 'new' 
			? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
			: editingRoleId!;

		await db.customRoles.put({
			id: roleId,
			name: roleFormName.trim(),
			prompt: roleFormPrompt.trim(),
			icon: roleFormIcon.trim(),
			desc: roleFormDesc.trim(),
			keywords: roleFormKeywords.trim(),
			createdAt: Date.now()
		});

		editingRoleId = null;
	}

	async function handleDeleteRole(id: string) {
		if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบบทบาทนี้?')) {
			await db.customRoles.delete(id);
			if (editingRoleId === id) {
				editingRoleId = null;
			}
		}
	}
	let showGeminiKey = $state(false);

	let localEnableOllamaLocal = $state(enableOllamaLocal);
	let localEnableOllamaCloud = $state(enableOllamaCloud);
	let localEnableGemini = $state(enableGemini);

	let testingLocal = $state(false);
	let testingCloud = $state(false);
	let testingGemini = $state(false);

	let localStatusLocal = $state<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
	let localStatusCloud = $state<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
	let localStatusGemini = $state<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

	$effect(() => {
		localEnableOllamaLocal = enableOllamaLocal;
	});
	$effect(() => {
		localEnableOllamaCloud = enableOllamaCloud;
	});
	$effect(() => {
		localEnableGemini = enableGemini;
	});
	$effect(() => {
		localEnableWorkspaceBridge = enableWorkspaceBridge;
	});

	function isValidUrl(urlString: string): boolean {
		try {
			const url = new URL(urlString);
			return url.protocol === 'http:' || url.protocol === 'https:';
		} catch (e) {
			return false;
		}
	}

	function handleLocalToggle(service: 'local' | 'cloud' | 'gemini' | 'workspace_bridge', checked: boolean) {
		if (service === 'local') {
			localEnableOllamaLocal = checked;
			enableOllamaLocal = checked;
			onRefreshModels();
		} else if (service === 'cloud') {
			localEnableOllamaCloud = checked;
			enableOllamaCloud = checked;
			onRefreshModels();
		} else if (service === 'gemini') {
			localEnableGemini = checked;
			enableGemini = checked;
			onRefreshModels();
		} else if (service === 'workspace_bridge') {
			localEnableWorkspaceBridge = checked;
			enableWorkspaceBridge = checked;
		}
	}

	// Initialize connection status messages when modal is opened based on pre-established parent connection states
	$effect(() => {
		if (isSettingsOpen) {
			if (isConnected && enableOllamaLocal) {
				localStatusLocal = { type: 'success', message: 'เชื่อมต่อสำเร็จ! (Connected)' };
			}
			if (isOllamaCloudConnected && enableOllamaCloud) {
				localStatusCloud = { type: 'success', message: 'เชื่อมต่อ Ollama Cloud สำเร็จ! (Connected)' };
			}
			if (geminiApiKey && enableGemini) {
				localStatusGemini = { type: 'success', message: 'ตรวจสอบ Google Gemini API Key สำเร็จ! (Active)' };
			}
			if (enableWorkspaceBridge) {
				localStatusWorkspaceBridge = { type: 'success', message: 'เชื่อมต่อ Workspace Bridge สำเร็จ! (Connected)' };
			}
		}
	});

	async function testWorkspaceBridgeConnection() {
		const url = workspaceBridgeUrl;
		if (!url) {
			localStatusWorkspaceBridge = { type: 'error', message: 'กรุณากรอก URL' };
			return;
		}
		if (!isValidUrl(url)) {
			localStatusWorkspaceBridge = { type: 'error', message: 'รูปแบบ URL ไม่ถูกต้อง (เช่น http://localhost:3000)' };
			return;
		}
		testingWorkspaceBridge = true;
		localStatusWorkspaceBridge = { type: 'idle', message: 'กำลังตรวจสอบการเชื่อมต่อ... (Verifying...)' };
		try {
			const cleanUrl = url.replace(/\/$/, '');
			const res = await fetch(`${cleanUrl}/status`);
			if (!res.ok) {
				throw new Error(`HTTP status ${res.status}`);
			}
			const data = await res.json();
			if (data.status === 'ok') {
				localStatusWorkspaceBridge = { type: 'success', message: `เชื่อมต่อสำเร็จ! โฟลเดอร์: ${data.workspace}` };
				localEnableWorkspaceBridge = true;
				enableWorkspaceBridge = true;
			} else {
				throw new Error('การตอบกลับจาก Server ไม่ถูกต้อง');
			}
		} catch (error: any) {
			enableWorkspaceBridge = false;
			localEnableWorkspaceBridge = false;
			const errMsg = error?.message || 'เชื่อมต่อล้มเหลว ตรวจสอบว่าได้รันสคริปต์ใน Terminal หรือยัง';
			localStatusWorkspaceBridge = { type: 'error', message: errMsg };
		} finally {
			testingWorkspaceBridge = false;
		}
	}

	// Manual connection test functions
	async function testLocalConnection() {
		const url = ollamaUrl;
		if (!url) {
			localStatusLocal = { type: 'error', message: 'กรุณากรอก URL' };
			return;
		}
		if (!isValidUrl(url)) {
			localStatusLocal = { type: 'error', message: 'รูปแบบ URL ไม่ถูกต้อง (เช่น http://localhost:11434)' };
			return;
		}
		testingLocal = true;
		localStatusLocal = { type: 'idle', message: 'กำลังตรวจสอบการเชื่อมต่อ... (Verifying...)' };
		try {
			const fetched = await fetchModels(url);
			const count = fetched.filter(m => !m.name.includes('gemini') && !m.name.includes('cloud')).length;
			localStatusLocal = { type: 'success', message: `เชื่อมต่อสำเร็จ! โหลดโมเดลทั้งหมด ${count} ตัว` };
			localEnableOllamaLocal = true;
			enableOllamaLocal = true;
			onRefreshModels();
		} catch (error: any) {
			enableOllamaLocal = false;
			localEnableOllamaLocal = false;
			const errMsg = error?.message || 'เชื่อมต่อล้มเหลว ตรวจสอบว่าเปิด Ollama หรือยัง และตั้งค่า CORS ถูกต้องหรือไม่';
			localStatusLocal = { type: 'error', message: errMsg };
		} finally {
			testingLocal = false;
		}
	}

	async function testCloudConnection() {
		const url = ollamaCloudUrl;
		const key = ollamaCloudApiKey;
		if (!url || !key) {
			localStatusCloud = { type: 'error', message: 'กรุณากรอก URL และ API Key' };
			return;
		}
		if (!isValidUrl(url)) {
			localStatusCloud = { type: 'error', message: 'รูปแบบ URL ไม่ถูกต้อง (เช่น https://api.ollama.com)' };
			return;
		}
		testingCloud = true;
		localStatusCloud = { type: 'idle', message: 'กำลังทดสอบการเชื่อมต่อ... (Verifying...)' };
		try {
			const fetched = await fetchModels(url, key, true);
			localStatusCloud = { type: 'success', message: `เชื่อมต่อ Ollama Cloud สำเร็จ! โหลดโมเดล ${fetched.length} ตัว` };
			localEnableOllamaCloud = true;
			enableOllamaCloud = true;
			onRefreshModels();
		} catch (error: any) {
			enableOllamaCloud = false;
			localEnableOllamaCloud = false;
			const errMsg = error?.message || 'เชื่อมต่อ Ollama Cloud ล้มเหลว ตรวจสอบ URL และ API Key';
			localStatusCloud = { type: 'error', message: errMsg };
		} finally {
			testingCloud = false;
		}
	}

	async function testGeminiConnection() {
		const key = geminiApiKey;
		if (!key) {
			localStatusGemini = { type: 'error', message: 'กรุณากรอก API Key' };
			return;
		}
		testingGemini = true;
		localStatusGemini = { type: 'idle', message: 'กำลังตรวจสอบ API Key... (Verifying...)' };
		try {
			const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.error?.message || `HTTP error ${res.status}`);
			}
			localStatusGemini = { type: 'success', message: 'ตรวจสอบ Google Gemini API Key สำเร็จ!' };
			localEnableGemini = true;
			enableGemini = true;
			onRefreshModels();
		} catch (error: any) {
			enableGemini = false;
			localEnableGemini = false;
			const errMsg = error?.message || 'ตรวจสอบ API Key ล้มเหลว กรุณาเช็คความถูกต้องของ API Key';
			localStatusGemini = { type: 'error', message: errMsg };
		} finally {
			testingGemini = false;
		}
	}

	function closeSettings() {
		isSettingsOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeSettings();
		}
	}

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
		activeModels[index] = val;
		activeModels = [...activeModels];
	}

	function updateModelTemp(index: number, val: number) {
		modelTemperatures[index] = val;
		modelTemperatures = [...modelTemperatures];
	}

	let activeDropdownIdx = $state<number | null>(null);
	let searchQuery = $state('');
	let activeDropdownTab = $state<'all' | 'local' | 'cloud' | 'gemini'>('all');
	let pinnedModelNames = $state<string[]>([]);
	let hiddenModelNames = $state<string[]>([]);

	let dropdownEl = $state<HTMLElement | null>(null);
	let dropdownTriggers = $state<HTMLElement[]>([]);

	function handleOutsideDropdownClick(e: MouseEvent) {
		if (activeDropdownIdx !== null) {
			const clickedInsideTrigger = dropdownTriggers.some(trigger => trigger && trigger.contains(e.target as Node));
			const clickedInsideDropdown = dropdownEl && dropdownEl.contains(e.target as Node);
			if (!clickedInsideTrigger && !clickedInsideDropdown) {
				activeDropdownIdx = null;
			}
		}
	}

	$effect(() => {
		if (activeDropdownIdx !== null) {
			window.addEventListener('click', handleOutsideDropdownClick);
		}
		return () => {
			window.removeEventListener('click', handleOutsideDropdownClick);
		};
	});

	$effect(() => {
		if (typeof window !== 'undefined') {
			const loadPinned = () => {
				const stored = localStorage.getItem('pinned_models');
				if (stored) {
					try {
						pinnedModelNames = JSON.parse(stored);
					} catch (e) {
						pinnedModelNames = [];
					}
				}
			};
			const loadHidden = () => {
				const stored = localStorage.getItem('hidden_models');
				if (stored) {
					try {
						hiddenModelNames = JSON.parse(stored);
					} catch (e) {
						hiddenModelNames = [];
					}
				}
			};
			loadPinned();
			loadHidden();
			window.addEventListener('pinned_models_updated', loadPinned);
			window.addEventListener('hidden_models_updated', loadHidden);
			return () => {
				window.removeEventListener('pinned_models_updated', loadPinned);
				window.removeEventListener('hidden_models_updated', loadHidden);
			};
		}
	});

	function togglePin(modelName: string, e?: MouseEvent) {
		if (e) e.stopPropagation();
		if (pinnedModelNames.includes(modelName)) {
			pinnedModelNames = pinnedModelNames.filter(name => name !== modelName);
		} else {
			pinnedModelNames = [...pinnedModelNames, modelName];
			if (hiddenModelNames.includes(modelName)) {
				hiddenModelNames = hiddenModelNames.filter(name => name !== modelName);
				localStorage.setItem('hidden_models', JSON.stringify(hiddenModelNames));
				window.dispatchEvent(new Event('hidden_models_updated'));
			}
		}
		localStorage.setItem('pinned_models', JSON.stringify(pinnedModelNames));
		window.dispatchEvent(new Event('pinned_models_updated'));
	}

	function toggleHide(modelName: string, e?: MouseEvent) {
		if (e) e.stopPropagation();
		if (hiddenModelNames.includes(modelName)) {
			hiddenModelNames = hiddenModelNames.filter(name => name !== modelName);
		} else {
			hiddenModelNames = [...hiddenModelNames, modelName];
			if (pinnedModelNames.includes(modelName)) {
				pinnedModelNames = pinnedModelNames.filter(name => name !== modelName);
				localStorage.setItem('pinned_models', JSON.stringify(pinnedModelNames));
				window.dispatchEvent(new Event('pinned_models_updated'));
			}
		}
		localStorage.setItem('hidden_models', JSON.stringify(hiddenModelNames));
		window.dispatchEvent(new Event('hidden_models_updated'));
	}

	let filteredDropdownModels = $derived(
		models.filter((m: any) => !searchQuery.trim() || m.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	let activeDropdownModels = $derived.by(() => {
		if (activeDropdownTab === 'local') {
			return filteredDropdownModels.filter((m: any) => m.source === 'local' || (!m.source && !m.name.startsWith('gemini-')));
		} else if (activeDropdownTab === 'cloud') {
			return filteredDropdownModels.filter((m: any) => m.source === 'cloud');
		} else if (activeDropdownTab === 'gemini') {
			return filteredDropdownModels.filter((m: any) => m.source === 'gemini' || (!m.source && m.name.startsWith('gemini-')));
		} else {
			return filteredDropdownModels;
		}
	});

	let localDropdownModels = $derived(
		filteredDropdownModels.filter((m: any) => m.source === 'local' || (!m.source && !m.name.startsWith('gemini-')))
	);
	let cloudDropdownModels = $derived(
		filteredDropdownModels.filter((m: any) => m.source === 'cloud')
	);
	let geminiDropdownModels = $derived(
		filteredDropdownModels.filter((m: any) => m.source === 'gemini' || (!m.source && m.name.startsWith('gemini-')))
	);

	let pinnedDropdownModels = $derived(
		activeDropdownModels.filter((m: any) => pinnedModelNames.includes(m.name))
	);

	let normalDropdownModels = $derived(
		activeDropdownModels.filter((m: any) => !pinnedModelNames.includes(m.name) && !hiddenModelNames.includes(m.name))
	);

	let hiddenDropdownModels = $derived(
		activeDropdownModels.filter((m: any) => hiddenModelNames.includes(m.name))
	);

	// Storage Management States & Handlers
	let stats = $state({
		chatsCount: 0,
		projectsCount: 0,
		canvasFilesCount: 0,
		memoriesCount: 0,
		upvotesCount: 0,
		downvotesCount: 0
	});

	async function updateStats() {
		try {
			stats.chatsCount = await db.conversations.count();
			stats.projectsCount = await db.projects.count();
			stats.canvasFilesCount = await db.canvasFiles.count();
			stats.memoriesCount = await db.aiMemories.count();

			// Count positive/negative feedbacks in conversations
			let up = 0;
			let down = 0;
			const convs = await db.conversations.toArray();
			for (const c of convs) {
				if (c.messages) {
					for (const m of c.messages) {
						if (m.feedback === 'up') {
							up++;
						} else if (m.feedback === 'down') {
							down++;
						}
					}
				}
			}
			stats.upvotesCount = up;
			stats.downvotesCount = down;
		} catch (e) {
			console.error('Failed to get database stats:', e);
		}
	}

	$effect(() => {
		if (isSettingsOpen && activeTab === 'storage') {
			updateStats();
		}
	});

	async function exportStorageData() {
		try {
			const exportObj = {
				version: 1,
				timestamp: Date.now(),
				localStorage: {
					ollama_url: localStorage.getItem('ollama_url') || '',
					gemini_api_key: localStorage.getItem('gemini_api_key') || '',
					ollama_cloud_api_key: localStorage.getItem('ollama_cloud_api_key') || '',
					ollama_cloud_url: localStorage.getItem('ollama_cloud_url') || '',
					ollama_active_models: localStorage.getItem('ollama_active_models') || '',
					ollama_selected_model: localStorage.getItem('ollama_selected_model') || '',
					ollama_model_temperatures: localStorage.getItem('ollama_model_temperatures') || '',
					ollama_topp: localStorage.getItem('ollama_topp') || '',
					ollama_topk: localStorage.getItem('ollama_topk') || '',
					ollama_numctx: localStorage.getItem('ollama_numctx') || '',
					ollama_numpredict: localStorage.getItem('ollama_numpredict') || '',
					ollama_repeatpenalty: localStorage.getItem('ollama_repeatpenalty') || '',
					ollama_customize_settings: localStorage.getItem('ollama_customize_settings') || '',
					ollama_global_context: localStorage.getItem('ollama_global_context') || '',
					chat_font_size: localStorage.getItem('chat_font_size') || '',
					chat_font_family: localStorage.getItem('chat_font_family') || '',
					pinned_models: localStorage.getItem('pinned_models') || ''
				},
				indexedDB: {
					conversations: await db.conversations.toArray(),
					projects: await db.projects.toArray(),
					canvasFiles: await db.canvasFiles.toArray(),
					aiMemories: await db.aiMemories.toArray(),
					customRoles: await db.customRoles.toArray()
				}
			};

			const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
			const downloadAnchor = document.createElement('a');
			downloadAnchor.setAttribute("href", dataStr);
			downloadAnchor.setAttribute("download", `order-ai-backup-${new Date().toISOString().slice(0, 10)}.json`);
			document.body.appendChild(downloadAnchor);
			downloadAnchor.click();
			downloadAnchor.remove();
		} catch (error) {
			console.error('Failed to export data:', error);
			alert('เกิดข้อผิดพลาดในการส่งออกข้อมูล');
		}
	}

	let importFileInput = $state<HTMLInputElement | null>(null);

	async function handleRestoreData(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const data = JSON.parse(e.target?.result as string);
				if (!data || typeof data !== 'object' || !data.indexedDB) {
					throw new Error('Invalid backup file format');
				}

				if (!confirm('การคืนค่าข้อมูลจะทับข้อมูลปัจจุบันทั้งหมดรวมถึงแชทและโปรเจกต์ หน้าเว็บจะรีโหลดใหม่เพื่อแสดงผล คุณต้องการดำเนินการต่อหรือไม่?')) {
					return;
				}

				// Restore localStorage
				if (data.localStorage) {
					Object.entries(data.localStorage).forEach(([key, val]) => {
						if (val) {
							localStorage.setItem(key, val as string);
						} else {
							localStorage.removeItem(key);
						}
					});
				}

				// Restore IndexedDB
				await db.transaction('rw', [db.conversations, db.projects, db.canvasFiles, db.aiMemories, db.customRoles], async () => {
					await db.conversations.clear();
					await db.projects.clear();
					await db.canvasFiles.clear();
					await db.aiMemories.clear();
					await db.customRoles.clear();

					if (Array.isArray(data.indexedDB.conversations)) {
						await db.conversations.bulkAdd(data.indexedDB.conversations);
					}
					if (Array.isArray(data.indexedDB.projects)) {
						await db.projects.bulkAdd(data.indexedDB.projects);
					}
					if (Array.isArray(data.indexedDB.canvasFiles)) {
						await db.canvasFiles.bulkAdd(data.indexedDB.canvasFiles);
					}
					if (Array.isArray(data.indexedDB.aiMemories)) {
						await db.aiMemories.bulkAdd(data.indexedDB.aiMemories);
					}
					if (Array.isArray(data.indexedDB.customRoles)) {
						await db.customRoles.bulkAdd(data.indexedDB.customRoles);
					}
				});

				// Update bound arrays
				conversations = await db.conversations.orderBy('createdAt').reverse().toArray();
				projects = await db.projects.orderBy('createdAt').toArray();

				alert('คืนค่าข้อมูลสำเร็จแล้ว! ระบบกำลังรีโหลดหน้าเว็บ');
				window.location.reload();
			} catch (error) {
				console.error('Failed to restore backup:', error);
				alert('การคืนค่าข้อมูลล้มเหลว ไฟล์อาจชำรุดหรือไม่ถูกต้อง');
			}
		};
		reader.readAsText(file);
	}

	async function handleClearData() {
		if (!confirm('คำเตือน! ข้อมูลการสนทนา โปรเจกต์ ไฟล์บน Canvas และความจำทั้งหมดจะถูกลบอย่างถาวรและไม่สามารถกู้คืนได้ คุณต้องการลบข้อมูลทั้งหมดใช่หรือไม่?')) {
			return;
		}

		try {
			await db.transaction('rw', [db.conversations, db.projects, db.canvasFiles, db.aiMemories, db.customRoles], async () => {
				await db.conversations.clear();
				await db.projects.clear();
				await db.canvasFiles.clear();
				await db.aiMemories.clear();
				await db.customRoles.clear();
			});

			conversations = [];
			projects = [];

			alert('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว!');
			window.location.reload();
		} catch (error) {
			console.error('Failed to clear database:', error);
			alert('เกิดข้อผิดพลาดในการลบข้อมูล');
		}
	}
</script>

{#if isSettingsOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div 
		class="modal-backdrop" 
		onmousedown={(e) => mousedownTarget = e.target}
		onclick={(e) => {
			if (e.target === e.currentTarget && mousedownTarget === e.currentTarget) {
				closeSettings();
			}
		}} 
		transition:fade={{ duration: 150 }}
		role="button" 
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div 
			class="settings-modal-content" 
			onclick={(e) => e.stopPropagation()} 
			transition:scale={{ start: 0.95, duration: 150 }}
			role="dialog" 
			aria-modal="true" 
			tabindex="-1"
			onkeydown={handleKeydown}
		>
			<!-- Sidebar -->
			<div class="settings-sidebar">
				<div class="settings-brand">
					<svg class="glow-icon" viewBox="0 0 24 24" width="20" height="20">
						<path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
					</svg>
					<span>Settings</span>
				</div>
				
				<nav class="settings-nav">
					<!-- ── หมวดหลัก (ผู้ใช้ทั่วไป) ── -->
					<div class="nav-section-label">ทั่วไป</div>

					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'connections'} 
						onclick={() => activeTab = 'connections'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H5v-2h6V7h2v4h4v2z"/>
						</svg>
						<span>การเชื่อมต่อ AI</span>
					</button>

					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'context'} 
						onclick={() => activeTab = 'context'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
						</svg>
						<span>System Prompt</span>
					</button>

					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'roles'} 
						onclick={() => activeTab = 'roles'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
						</svg>
						<span>บทบาท AI (Roles)</span>
					</button>

					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'storage'} 
						onclick={() => activeTab = 'storage'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M12 2C6.48 2 2 4.02 2 6.5v11c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2zm0 18c-4.41 0-8-1.57-8-3.5v-2.3c1.94 1.15 4.8 1.8 8 1.8s6.06-.65 8-1.8v2.3c0 1.93-3.59 3.5-8 3.5zm0-5.5c-4.41 0-8-1.57-8-3.5v-2.3c1.94 1.15 4.8 1.8 8 1.8s6.06-.65 8-1.8v2.3c0 1.93-3.59 3.5-8 3.5zm0-5.5c-4.41 0-8-1.57-8-3.5S7.59 4 12 4s8 1.57 8 3.5S16.41 9 12 9z"/>
						</svg>
						<span>ข้อมูลและสำรอง</span>
					</button>

					<!-- ── ตัวคั่น: หมวดขั้นสูง ── -->
					<div class="nav-divider"></div>
					<div class="nav-section-label nav-section-label-advanced">⚙️ ขั้นสูง</div>

					<button 
						class="nav-tab-btn nav-tab-advanced" 
						class:active={activeTab === 'models'} 
						onclick={() => activeTab = 'models'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
						</svg>
						<span>จัดการโมเดล</span>
					</button>

					<button 
						class="nav-tab-btn nav-tab-advanced" 
						class:active={activeTab === 'chain'} 
						onclick={() => activeTab = 'chain'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M17 16h-4v-2h4c1.1 0 2-.9 2-2s-.9-2-2-2h-4V8h4c2.2 0 4 1.8 4 4s-1.8 4-4 4zm-6-2H7c-1.1 0-2-.9-2-2s.9-2 2-2h4V8H7c-2.2 0-4 1.8-4 4s1.8 4 4 4h4v-2zm-3-3h8v2H8v-2z"/>
						</svg>
						<span>Model Chain</span>
					</button>

					<button 
						class="nav-tab-btn nav-tab-advanced" 
						class:active={activeTab === 'advanced'} 
						onclick={() => activeTab = 'advanced'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M12.91 4.29l7.8 7.8c.39.39.39 1.02 0 1.41l-7.8 7.8c-.39.39-1.02.39-1.41 0l-7.8-7.8c-.39-.39-.39-1.02 0-1.41l7.8-7.8c.39-.39 1.03-.39 1.41 0zM12 7a5 5 0 100 10 5 5 0 000-10zm0 8a3 3 0 110-6 3 3 0 010 6z"/>
						</svg>
						<span>ค่า Parameters</span>
					</button>
				</nav>
			</div>

			<!-- Main Content -->
			<div class="settings-content-wrapper">
				<div class="settings-header">
					<h2>
						{#if activeTab === 'connections'}
							การเชื่อมต่อ AI
						{:else if activeTab === 'chain'}
							Model Chain (ลำดับโมเดล)
						{:else if activeTab === 'advanced'}
							ค่าพารามิเตอร์ขั้นสูง
						{:else if activeTab === 'context'}
							System Prompt (คำสั่งระบบ)
						{:else if activeTab === 'storage'}
							ข้อมูลและสำรอง
						{:else if activeTab === 'roles'}
							บทบาท AI (Roles)
						{:else if activeTab === 'models'}
							จัดการโมเดล
						{/if}
					</h2>
					<button class="settings-close-btn" onclick={closeSettings} aria-label="Close settings">
						<svg viewBox="0 0 24 24" width="20" height="20">
							<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
						</svg>
					</button>
				</div>

				<div class="settings-body scrollbar-custom">
					{#if activeTab === 'connections'}
						<div class="settings-section">
							<!-- ──── Provider Cards (แสดงทั้งหมดพร้อมกัน) ──── -->
							<p class="modal-help-subtext" style="margin-bottom: 16px;">เลือกผู้ให้บริการ AI ที่คุณต้องการใช้งาน กรอก URL หรือ API Key แล้วกดปุ่มทดสอบ</p>

							<!-- Ollama Local -->
							<div class="api-service-card" style="margin-bottom: 16px;">
								<div class="api-service-header">
									<div class="api-service-info">
										<h4>🖥️ Ollama (รันบนเครื่องของคุณ)</h4>
										<p>เรียกใช้ AI แบบโอเพนซอร์สบนเครื่องคอมพิวเตอร์ของคุณ ไม่ต้องเชื่อมอินเทอร์เน็ต ข้อมูลไม่ออกนอกเครื่อง</p>
									</div>
									<label class="toggle-switch">
										<input type="checkbox" checked={localEnableOllamaLocal} disabled={localStatusLocal.type !== 'success'} onchange={(e) => handleLocalToggle('local', e.currentTarget.checked)} />
										<span class="toggle-slider"></span>
									</label>
								</div>
								<div class="api-service-body">
									<div class="setting-item-block">
										<label for="modal-ollama-url">URL เซิร์ฟเวอร์ Ollama</label>
										<div class="modal-input-group">
											<input 
												id="modal-ollama-url"
												type="text" 
												placeholder="http://localhost:11434" 
												bind:value={ollamaUrl}
												oninput={() => {
													localStatusLocal = { type: 'idle', message: 'แก้ไข URL แล้ว กรุณากดปุ่มทดสอบการเชื่อมต่อ' };
													localEnableOllamaLocal = false;
													enableOllamaLocal = false;
												}}
											/>
										</div>
										<div class="status-alert" class:success={localStatusLocal.type === 'success'} class:error={localStatusLocal.type === 'error'}>
											<span class="status-alert-dot"></span>
											<span>{localStatusLocal.message || (enableOllamaLocal ? `เชื่อมต่อสำเร็จ (Connected).` : 'ไม่ได้เชื่อมต่อ กรุณากดทดสอบก่อน')}</span>
										</div>
										<div class="test-btn-container">
											<button type="button" class="modal-action-btn" onclick={testLocalConnection} disabled={testingLocal}>
												{#if testingLocal}กำลังทดสอบ...{:else}ทดสอบการเชื่อมต่อ{/if}
											</button>
										</div>
									</div>
									{#if !isConnected && typeof window !== 'undefined' && (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')}
										<div class="cors-help-card animate-fade-in" style="margin-top: 10px;">
											<h4>CORS Configuration Guide</h4>
											<p>To connect local Ollama from a deployed site, you need to enable CORS origins:</p>
											<ol>
												<li>Close the Ollama application.</li>
												<li>Run in Terminal to allow CORS:
													<pre><code>launchctl setenv OLLAMA_ORIGINS "*"</code></pre>
												</li>
												<li>Restart Ollama.</li>
											</ol>
										</div>
									{/if}
								</div>
							</div>

							<!-- Gemini Cloud -->
							<div class="api-service-card" style="margin-bottom: 16px;">
								<div class="api-service-header">
									<div class="api-service-info">
										<h4>✨ Google Gemini (Cloud)</h4>
										<p>ใช้ Gemini AI จาก Google โดยตรง ต้องการ API Key จาก Google AI Studio (ฟรี)</p>
									</div>
									<label class="toggle-switch">
										<input type="checkbox" checked={localEnableGemini} disabled={localStatusGemini.type !== 'success'} onchange={(e) => handleLocalToggle('gemini', e.currentTarget.checked)} />
										<span class="toggle-slider"></span>
									</label>
								</div>
								<div class="api-service-body">
									<div class="setting-item-block">
										<label for="modal-gemini-key">Google Gemini API Key</label>
										<div class="modal-input-group">
											<input 
												id="modal-gemini-key"
												type={showGeminiKey ? 'text' : 'password'} 
												placeholder="AI Studio Gemini API Key..." 
												bind:value={geminiApiKey}
												oninput={() => {
													localStatusGemini = { type: 'idle', message: 'แก้ไข API Key แล้ว กรุณากดปุ่มทดสอบการเชื่อมต่อ' };
													localEnableGemini = false;
													enableGemini = false;
												}}
											/>
											<button class="modal-eye-btn" onclick={() => showGeminiKey = !showGeminiKey} title={showGeminiKey ? 'Hide API Key' : 'Show API Key'}>
												{#if showGeminiKey}
													<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
												{:else}
													<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
												{/if}
											</button>
										</div>
										<div class="status-alert" class:success={localStatusGemini.type === 'success'} class:error={localStatusGemini.type === 'error'}>
											<span class="status-alert-dot"></span>
											<span>{localStatusGemini.message || (enableGemini ? 'Google Gemini API Key พร้อมใช้งาน (Active).' : 'ยังไม่ได้เชื่อมต่อ กรุณากรอก API Key แล้วทดสอบ')}</span>
										</div>
										<div class="test-btn-container">
											<button type="button" class="modal-action-btn" onclick={testGeminiConnection} disabled={testingGemini}>
												{#if testingGemini}กำลังทดสอบ...{:else}ทดสอบการเชื่อมต่อ{/if}
											</button>
										</div>
									</div>
								</div>
							</div>

							<!-- Ollama Cloud -->
							<div class="api-service-card" style="margin-bottom: 16px;">
								<div class="api-service-header">
									<div class="api-service-info">
										<h4>☁️ Ollama Cloud (Remote)</h4>
										<p>เชื่อมต่อกับ Ollama ที่ติดตั้งบน Server หรือ Cloud ต้องการ URL และ API Key</p>
									</div>
									<label class="toggle-switch">
										<input type="checkbox" checked={localEnableOllamaCloud} disabled={localStatusCloud.type !== 'success'} onchange={(e) => handleLocalToggle('cloud', e.currentTarget.checked)} />
										<span class="toggle-slider"></span>
									</label>
								</div>
								<div class="api-service-body">
									<div class="setting-item-block">
										<label for="modal-ollama-cloud-url">Ollama Cloud Base URL</label>
										<input id="modal-ollama-cloud-url" type="text" class="modal-text-input" placeholder="https://ollama.com" bind:value={ollamaCloudUrl}
											oninput={() => { localStatusCloud = { type: 'idle', message: 'แก้ไข Base URL แล้ว กรุณากดปุ่มทดสอบ' }; localEnableOllamaCloud = false; enableOllamaCloud = false; }}
										/>
									</div>
									<div class="setting-item-block" style="margin-top: 10px;">
										<label for="modal-ollama-cloud-key">Ollama Cloud API Key</label>
										<div class="modal-input-group">
											<input id="modal-ollama-cloud-key" type={showOllamaCloudKey ? 'text' : 'password'} placeholder="Ollama Cloud API Key..." bind:value={ollamaCloudApiKey}
												oninput={() => { localStatusCloud = { type: 'idle', message: 'แก้ไข API Key แล้ว กรุณากดปุ่มทดสอบ' }; localEnableOllamaCloud = false; enableOllamaCloud = false; }}
											/>
											<button class="modal-eye-btn" onclick={() => showOllamaCloudKey = !showOllamaCloudKey} title={showOllamaCloudKey ? 'Hide' : 'Show'}>
												{#if showOllamaCloudKey}
													<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
												{:else}
													<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
												{/if}
											</button>
										</div>
										<div class="status-alert" class:success={localStatusCloud.type === 'success'} class:error={localStatusCloud.type === 'error'}>
											<span class="status-alert-dot"></span>
											<span>{localStatusCloud.message || (enableOllamaCloud ? 'เชื่อมต่อ Ollama Cloud สำเร็จ.' : 'ยังไม่ได้เชื่อมต่อ กรุณากรอกข้อมูลแล้วทดสอบ')}</span>
										</div>
										<div class="test-btn-container">
											<button type="button" class="modal-action-btn" onclick={testCloudConnection} disabled={testingCloud}>
												{#if testingCloud}กำลังทดสอบ...{:else}ทดสอบการเชื่อมต่อ{/if}
											</button>
										</div>
									</div>
								</div>
							</div>

							<!-- Workspace Bridge — Accordion (Developer Tool) -->
							<div class="workspace-bridge-accordion">
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div class="ws-accordion-header" onclick={() => showWorkspaceBridge = !showWorkspaceBridge}>
									<div style="display: flex; align-items: center; gap: 10px;">
										<span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">🔧 Developer: Workspace Bridge</span>
										{#if enableWorkspaceBridge}
											<span class="subtab-status-dot active" style="width: 8px; height: 8px; border-radius: 50%; background: #51cf66; box-shadow: 0 0 6px rgba(81,207,102,0.6);"></span>
										{/if}
									</div>
									<svg style="transition: transform 0.2s; transform: rotate({showWorkspaceBridge ? '180deg' : '0deg'});" viewBox="0 0 24 24" width="16" height="16">
										<path fill="currentColor" d="M7 10l5 5 5-5z"/>
									</svg>
								</div>
								{#if showWorkspaceBridge}
									<div class="api-service-card" style="margin-top: 12px; border-color: rgba(168, 199, 250, 0.2);">
										<div class="api-service-header">
											<div class="api-service-info">
												<h4>Workspace Local Bridge</h4>
												<p>Sync files directly with your computer's folder (สำหรับนักพัฒนา)</p>
											</div>
											<label class="toggle-switch">
												<input type="checkbox" checked={localEnableWorkspaceBridge} disabled={localStatusWorkspaceBridge.type !== 'success'} onchange={(e) => handleLocalToggle('workspace_bridge', e.currentTarget.checked)} />
												<span class="toggle-slider"></span>
											</label>
										</div>
										<div class="api-service-body">
											<div class="setting-item-block">
												<label for="modal-bridge-url">Bridge Server URL</label>
												<div class="modal-input-group">
													<input id="modal-bridge-url" type="text" placeholder="http://localhost:3000" bind:value={workspaceBridgeUrl}
														oninput={() => { localStatusWorkspaceBridge = { type: 'idle', message: 'แก้ไข URL แล้ว กรุณากดปุ่มทดสอบ' }; localEnableWorkspaceBridge = false; enableWorkspaceBridge = false; }}
													/>
												</div>
												<div class="status-alert" class:success={localStatusWorkspaceBridge.type === 'success'} class:error={localStatusWorkspaceBridge.type === 'error'}>
													<span class="status-alert-dot"></span>
													<span>{localStatusWorkspaceBridge.message || (enableWorkspaceBridge ? 'เชื่อมต่อสำเร็จ (Connected).' : 'ยังไม่ได้เชื่อมต่อ')}</span>
												</div>
												<div class="test-btn-container">
													<button type="button" class="modal-action-btn" onclick={testWorkspaceBridgeConnection} disabled={testingWorkspaceBridge}>
														{#if testingWorkspaceBridge}กำลังทดสอบ...{:else}ทดสอบการเชื่อมต่อ{/if}
													</button>
												</div>
											</div>

											<!-- <div class="cors-help-card animate-fade-in" style="margin-top: 15px; padding: 15px; border-radius: 8px; background-color: var(--bg-secondary); border: 1px solid var(--border-color);">
												<h4 style="margin-top: 0; margin-bottom: 10px; color: var(--accent-blue);">Workspace Bridge Guide</h4>
												<div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem; line-height: 1.5; color: var(--text-secondary);">
													<div>
														<strong>1. ดาวน์โหลดสคริปต์:</strong>
														<div style="margin-top: 6px;">
															<a href="/mcp-bridge.ts" download="mcp-bridge.ts" class="modal-action-btn" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 0.8rem; background-color: var(--accent-blue); color: #fff; border-radius: 4px; border: none; font-weight: 500; cursor: pointer;">
																<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z"/></svg>
																ดาวน์โหลด mcp-bridge.ts
															</a>
														</div>
													</div>
													<div style="border-top: 1px dashed var(--border-color); padding-top: 8px;">
														<strong>2. สร้าง SSL Certificate:</strong>
														<pre style="background: var(--bg-primary); padding: 8px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.75rem; margin: 4px 0;"><code>openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost"</code></pre>
													</div>
													<div style="border-top: 1px dashed var(--border-color); padding-top: 8px;">
														<strong>3. รันเซิร์ฟเวอร์:</strong>
														<pre style="background: var(--bg-primary); padding: 8px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.75rem; margin: 4px 0;"><code>bun scripts/mcp-bridge.ts</code></pre>
													</div>
												</div>
											</div> -->
										</div>
									</div>
								{/if}
							</div>
						</div>
					{:else if activeTab === 'chain'}
						<div class="settings-section">
							<!-- Info Banner for general users -->
							<div class="chain-info-banner">
								<div class="chain-info-icon">🔗</div>
								<div>
									<h3 style="margin: 0 0 4px 0; font-size: 0.95rem;">Multi-Model Chain (ลำดับโมเดล)</h3>
									<p class="modal-help-subtext" style="margin: 0;">ฟีเจอร์นี้ให้คุณต่อโมเดลหลายตัวเป็นลำดับ เช่น โมเดลแรกรับคำถาม → โมเดลที่สองประมวลผล ผู้ใช้ทั่วไปไม่จำเป็นต้องปรับ ใช้ Step 1 เพียงตัวเดียวก็เพียงพอ</p>
								</div>
							</div>

							<div class="setting-item-block">
								<!-- (model chain intro removed, replaced with chain-info-banner above) -->
							</div>

							<div class="model-chain-cards">
								{#each activeModels as model, idx (idx)}
									<div class="chain-step-card animate-zoom-in">
										<div class="chain-card-header">
											<span class="chain-step-index">Step {idx + 1}</span>
											<span class="chain-step-role">
												{#if idx === 0}
													(Primary Chat / Prompt Refiner)
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
													class="chain-remove-btn" 
													onclick={() => removeModelStep(idx)}
													title="Remove step from chain"
												>
													✕
												</button>
											{/if}
										</div>

										<div class="chain-card-body">
											<div class="modal-form-item custom-select-container">
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div 
													bind:this={dropdownTriggers[idx]}
													class="custom-select-trigger"
													onclick={(e) => {
														searchQuery = '';
														activeDropdownTab = 'all';
														activeDropdownIdx = activeDropdownIdx === idx ? null : idx;
													}}
												>
													<span class="trigger-text">{model || 'Select a model...'}</span>
													<svg class="chevron-down" viewBox="0 0 24 24" width="12" height="12">
														<path fill="currentColor" d="M7 10l5 5 5-5z"/>
													</svg>
												</div>

												{#if activeDropdownIdx === idx}
													<!-- Custom Dropdown Panel -->
													<div 
														bind:this={dropdownEl} 
														class="custom-select-dropdown"
														onclick={(e) => e.stopPropagation()}
														role="presentation"
													>
														<!-- Search Header -->
														<div class="dropdown-search-wrapper">
															<svg class="search-icon" viewBox="0 0 24 24" width="12" height="12">
																<path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
															</svg>
															<input 
																type="text" 
																placeholder="ค้นหาโมเดล..." 
																bind:value={searchQuery}
																onkeydown={(e) => {
																	if (e.key === 'Escape') activeDropdownIdx = null;
																}}
															/>
															{#if searchQuery}
																<button 
																	type="button"
																	class="clear-search-btn" 
																	onclick={(e) => { e.stopPropagation(); searchQuery = ''; }}
																>
																	✕
																</button>
															{/if}
														</div>

														<!-- Tabs Header -->
														<div class="dropdown-tabs">
															<button 
																type="button"
																class="dropdown-tab-btn" 
																class:active={activeDropdownTab === 'all'}
																onclick={() => activeDropdownTab = 'all'}
															>
																ทั้งหมด ({filteredDropdownModels.length})
															</button>
															<button 
																type="button"
																class="dropdown-tab-btn" 
																class:active={activeDropdownTab === 'local'}
																onclick={() => activeDropdownTab = 'local'}
															>
																Local ({localDropdownModels.length})
															</button>
															<button 
																type="button"
																class="dropdown-tab-btn" 
																class:active={activeDropdownTab === 'cloud'}
																onclick={() => activeDropdownTab = 'cloud'}
															>
																Cloud ({cloudDropdownModels.length})
															</button>
															<button 
																type="button"
																class="dropdown-tab-btn" 
																class:active={activeDropdownTab === 'gemini'}
																onclick={() => activeDropdownTab = 'gemini'}
															>
																Gemini ({geminiDropdownModels.length})
															</button>
														</div>

														<!-- Model List -->
														<div class="dropdown-list-container scrollbar-custom">
															<!-- Favorite Section -->
															{#if pinnedDropdownModels.length > 0}
																<div class="dropdown-group-header">★ โมเดลที่ชื่นชอบ</div>
																<div class="dropdown-model-grid">
																	{#each pinnedDropdownModels as m}
																		<div 
																			class="dropdown-model-card" 
																			class:selected={model === m.name}
																			role="button"
																			tabindex="0"
																			onclick={() => {
																				updateModelStep(idx, m.name);
																				activeDropdownIdx = null;
																			}}
																			onkeydown={(e) => {
																				if (e.key === 'Enter' || e.key === ' ') {
																					e.preventDefault();
																					updateModelStep(idx, m.name);
																					activeDropdownIdx = null;
																				}
																			}}
																		>
																			<div class="dropdown-card-content" style="width: 100%;">
																				<div class="dropdown-name-row">
																					<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																				</div>
																				<div class="dropdown-meta-row" style="margin-top: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
																					<span class="dropdown-source-badge {m.source || 'local'}">
																						{m.source === 'gemini' ? 'Gemini' : m.source === 'cloud' ? 'Cloud' : 'Local'}
																					</span>
																					<div class="dropdown-actions">
																						<button 
																							type="button"
																							class="dropdown-pin-btn pinned" 
																							onclick={(e) => togglePin(m.name, e)}
																							title="ถอนหมุดโมเดล"
																						>
																							★
																						</button>
																						<button 
																							type="button"
																							class="dropdown-hide-btn" 
																							onclick={(e) => toggleHide(m.name, e)}
																							title="ซ่อนโมเดล"
																						>
																							<svg viewBox="0 0 24 24" width="12" height="12">
																								<path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
																							</svg>
																						</button>
																					</div>
																				</div>
																			</div>
																		</div>
																	{/each}
																</div>
															{/if}

															<!-- Normal Section -->
															{#if normalDropdownModels.length > 0}
																<div class="dropdown-group-header">โมเดลทั่วไป</div>
																<div class="dropdown-model-grid">
																	{#each normalDropdownModels as m}
																		<div 
																			class="dropdown-model-card" 
																			class:selected={model === m.name}
																			role="button"
																			tabindex="0"
																			onclick={() => {
																				updateModelStep(idx, m.name);
																				activeDropdownIdx = null;
																			}}
																			onkeydown={(e) => {
																				if (e.key === 'Enter' || e.key === ' ') {
																					e.preventDefault();
																					updateModelStep(idx, m.name);
																					activeDropdownIdx = null;
																				}
																			}}
																		>
																			<div class="dropdown-card-content" style="width: 100%;">
																				<div class="dropdown-name-row">
																					<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																				</div>
																				<div class="dropdown-meta-row" style="margin-top: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
																					<span class="dropdown-source-badge {m.source || 'local'}">
																						{m.source === 'gemini' ? 'Gemini' : m.source === 'cloud' ? 'Cloud' : 'Local'}
																					</span>
																					<div class="dropdown-actions">
																						<button 
																							type="button"
																							class="dropdown-pin-btn" 
																							class:pinned={pinnedModelNames.includes(m.name)}
																							onclick={(e) => togglePin(m.name, e)}
																							title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																						>
																							★
																						</button>
																						<button 
																							type="button"
																							class="dropdown-hide-btn" 
																							onclick={(e) => toggleHide(m.name, e)}
																							title="ซ่อนโมเดล"
																						>
																							<svg viewBox="0 0 24 24" width="12" height="12">
																								<path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
																							</svg>
																						</button>
																					</div>
																				</div>
																			</div>
																		</div>
																	{/each}
																</div>
															{/if}

															<!-- Hidden Section -->
															{#if hiddenDropdownModels.length > 0}
																<div class="dropdown-group-header">👁️ โมเดลที่ซ่อนไว้</div>
																<div class="dropdown-model-grid">
																	{#each hiddenDropdownModels as m}
																		<div 
																			class="dropdown-model-card dropdown-model-hidden" 
																			class:selected={model === m.name}
																			role="button"
																			tabindex="0"
																			onclick={() => {
																				updateModelStep(idx, m.name);
																				activeDropdownIdx = null;
																			}}
																			onkeydown={(e) => {
																				if (e.key === 'Enter' || e.key === ' ') {
																					e.preventDefault();
																					updateModelStep(idx, m.name);
																					activeDropdownIdx = null;
																				}
																			}}
																		>
																			<div class="dropdown-card-content" style="width: 100%;">
																				<div class="dropdown-name-row">
																					<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																				</div>
																				<div class="dropdown-meta-row" style="margin-top: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
																					<span class="dropdown-source-badge {m.source || 'local'}">
																						{m.source === 'gemini' ? 'Gemini' : m.source === 'cloud' ? 'Cloud' : 'Local'}
																					</span>
																					<div class="dropdown-actions">
																						<button 
																							type="button"
																							class="dropdown-pin-btn" 
																							class:pinned={pinnedModelNames.includes(m.name)}
																							onclick={(e) => togglePin(m.name, e)}
																							title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																						>
																							★
																						</button>
																						<button 
																							type="button" 
																							class="dropdown-hide-btn hidden-active" 
																							onclick={(e) => toggleHide(m.name, e)}
																							title="แสดงโมเดล"
																						>
																							<svg viewBox="0 0 24 24" width="12" height="12">
																								<path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.82l2.92 2.92c1.51-1.2 2.7-2.78 3.44-4.74-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
																							</svg>
																						</button>
																					</div>
																				</div>
																			</div>
																		</div>
																	{/each}
																</div>
															{/if}

															{#if pinnedDropdownModels.length === 0 && normalDropdownModels.length === 0 && hiddenDropdownModels.length === 0}
																<div class="dropdown-empty">ไม่พบโมเดลที่ค้นหา</div>
															{/if}
														</div>
													</div>
												{/if}
											</div>

											{#if customizeSettings}
												<div class="modal-form-item temp-slider-group animate-fade-in">
													<div class="setting-label-row">
														<label for="temp-slider-{idx}">Creativity / Temperature (จินตนาการ)</label>
														<div class="val-display-group">
															<button 
																class="individual-reset-btn" 
																onclick={() => modelTemperatures[idx] = (idx === 1 ? 0.2 : 0.7)} 
																title="Reset to default temperature"
															>
																<svg viewBox="0 0 24 24" width="12" height="12">
																	<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
																</svg>
															</button>
															<span class="setting-val-tag">
																{(modelTemperatures[idx] !== undefined ? modelTemperatures[idx] : 0.7).toFixed(2)}
															</span>
														</div>
													</div>
													<div class="slider-wrapper">
														<input 
															id="temp-slider-{idx}"
															type="range" 
															min="0" 
															max="1.5" 
															step="0.05" 
															value={modelTemperatures[idx] !== undefined ? modelTemperatures[idx] : 0.7}
															oninput={(e) => updateModelTemp(idx, parseFloat(e.currentTarget.value))}
															class="modal-slider"
														/>
													</div>
												</div>
											{/if}
										</div>
									</div>
								{/each}

								{#if activeModels.length < 3}
									<button 
										class="chain-add-btn" 
										onclick={addModelStep}
										disabled={models.length === 0}
									>
										<svg viewBox="0 0 24 24" width="18" height="18">
											<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
										</svg>
										<span>Add Next Execution Model (Maximum 3)</span>
									</button>
								{/if}
							</div>
						</div>
					{:else if activeTab === 'advanced'}
						<div class="settings-section">
							<!-- Advanced Mode Hero Card -->
							<div class="advanced-hero-card" class:advanced-hero-on={customizeSettings}>
								<div class="advanced-hero-left">
									<div class="advanced-hero-icon">{customizeSettings ? '🔬' : '🔒'}</div>
									<div>
										<h3 class="advanced-hero-title">
											{customizeSettings ? 'โหมดขั้นสูง — เปิดอยู่' : 'ค่า Parameters อัตโนมัติ'}
										</h3>
										<p class="advanced-hero-desc">
											{#if customizeSettings}
												คุณกำลังปรับแต่งค่าพารามิเตอร์โมเดลเอง การเปลี่ยนแปลงมีผลทันที
											{:else}
												ระบบใช้ค่าเริ่มต้นที่เหมาะสมที่สุด สำหรับผู้ใช้ทั่วไปไม่จำเป็นต้องปรับ
											{/if}
										</p>
									</div>
								</div>
								<label class="toggle-switch" title="เปิด/ปิดการปรับค่าขั้นสูง">
									<input 
										type="checkbox" 
										id="modal-customize-settings" 
										bind:checked={customizeSettings} 
									/>
									<span class="toggle-slider"></span>
								</label>
							</div>

							{#if !customizeSettings}
								<!-- Summary of current values when disabled -->
								<div class="advanced-summary-grid">
									<div class="advanced-summary-item">
										<span class="advanced-summary-label">Temperature</span>
										<span class="advanced-summary-val">{(modelTemperatures[0] ?? 0.7).toFixed(2)}</span>
									</div>
									<div class="advanced-summary-item">
										<span class="advanced-summary-label">Top P</span>
										<span class="advanced-summary-val">{topP.toFixed(2)}</span>
									</div>
									<div class="advanced-summary-item">
										<span class="advanced-summary-label">Top K</span>
										<span class="advanced-summary-val">{topK}</span>
									</div>
									<div class="advanced-summary-item">
										<span class="advanced-summary-label">Context</span>
										<span class="advanced-summary-val">{numCtx >= 1024 ? (numCtx / 1024).toFixed(0) + 'K' : numCtx}</span>
									</div>
									<div class="advanced-summary-item">
										<span class="advanced-summary-label">Max Tokens</span>
										<span class="advanced-summary-val">{numPredict === 0 ? '∞' : numPredict}</span>
									</div>
									<div class="advanced-summary-item">
										<span class="advanced-summary-label">Repeat Penalty</span>
										<span class="advanced-summary-val">{repeatPenalty.toFixed(2)}</span>
									</div>
								</div>
							{/if}

							<div class="advanced-sliders-container" class:disabled-settings={!customizeSettings}>
								<!-- Top P -->
								<div class="advanced-tuning-card">
									<div class="setting-label-row">
										<label for="modal-topp-slider">Top P (สัดส่วนความน่าจะเป็นสะสม)</label>
										<div class="val-display-group">
											<button 
												class="individual-reset-btn" 
												onclick={() => topP = 0.9} 
												disabled={!customizeSettings}
												title="Reset to 0.90"
											>
												<svg viewBox="0 0 24 24" width="12" height="12">
													<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
												</svg>
											</button>
											<span class="setting-val-tag">{topP.toFixed(2)}</span>
										</div>
									</div>
									<div class="slider-wrapper">
										<input 
											id="modal-topp-slider"
											type="range" 
											min="0" 
											max="1" 
											step="0.01" 
											bind:value={topP}
											disabled={!customizeSettings}
											class="modal-slider"
										/>
									</div>
								</div>

								<!-- Top K -->
								<div class="advanced-tuning-card">
									<div class="setting-label-row">
										<label for="modal-topk-slider">Top K (กลุ่มคำที่มีโอกาสสูงสุด)</label>
										<div class="val-display-group">
											<button 
												class="individual-reset-btn" 
												onclick={() => topK = 40} 
												disabled={!customizeSettings}
												title="Reset to 40"
											>
												<svg viewBox="0 0 24 24" width="12" height="12">
													<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
												</svg>
											</button>
											<span class="setting-val-tag">{topK}</span>
										</div>
									</div>
									<div class="slider-wrapper">
										<input 
											id="modal-topk-slider"
											type="range" 
											min="1" 
											max="100" 
											step="1" 
											bind:value={topK}
											disabled={!customizeSettings}
											class="modal-slider"
										/>
									</div>
								</div>

								<!-- Context Limit -->
								<div class="advanced-tuning-card">
									<div class="setting-label-row">
										<label for="modal-numctx-slider">Context Limit (หน่วยความจำแชต)</label>
										<div class="val-display-group">
											<button 
												class="individual-reset-btn" 
												onclick={() => numCtx = 4096} 
												disabled={!customizeSettings}
												title="Reset to 4096"
											>
												<svg viewBox="0 0 24 24" width="12" height="12">
													<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
												</svg>
											</button>
											<span class="setting-val-tag">{numCtx} tokens</span>
										</div>
									</div>
									<div class="slider-wrapper">
										<input 
											id="modal-numctx-slider"
											type="range" 
											min="1024" 
											max="32768" 
											step="1024" 
											bind:value={numCtx}
											disabled={!customizeSettings}
											class="modal-slider"
										/>
									</div>
								</div>

								<!-- Max Tokens -->
								<div class="advanced-tuning-card">
									<div class="setting-label-row">
										<label for="modal-numpredict-slider">Max Tokens (จำกัดคำตอบสูงสุด)</label>
										<div class="val-display-group">
											<button 
												class="individual-reset-btn" 
												onclick={() => numPredict = 0} 
												disabled={!customizeSettings}
												title="Reset to Unlimited"
											>
												<svg viewBox="0 0 24 24" width="12" height="12">
													<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
												</svg>
											</button>
											<span class="setting-val-tag">{numPredict === 0 ? 'Unlimited (ไม่จำกัด)' : `${numPredict} tokens`}</span>
										</div>
									</div>
									<div class="slider-wrapper">
										<input 
											id="modal-numpredict-slider"
											type="range" 
											min="0" 
											max="8192" 
											step="128" 
											bind:value={numPredict}
											disabled={!customizeSettings}
											class="modal-slider"
										/>
									</div>
								</div>

								<!-- Repeat Penalty -->
								<div class="advanced-tuning-card">
									<div class="setting-label-row">
										<label for="modal-repeatpenalty-slider">Repeat Penalty (อัตราลดการพูดซ้ำ)</label>
										<div class="val-display-group">
											<button 
												class="individual-reset-btn" 
												onclick={() => repeatPenalty = 1.1} 
												disabled={!customizeSettings}
												title="Reset to 1.10"
											>
												<svg viewBox="0 0 24 24" width="12" height="12">
													<path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
												</svg>
											</button>
											<span class="setting-val-tag">{repeatPenalty.toFixed(2)}</span>
										</div>
									</div>
									<div class="slider-wrapper">
										<input 
											id="modal-repeatpenalty-slider"
											type="range" 
											min="0.5" 
											max="2.0" 
											step="0.05" 
											bind:value={repeatPenalty}
											disabled={!customizeSettings}
											class="modal-slider"
										/>
									</div>
								</div>
							</div>
						</div>
					{:else if activeTab === 'context'}
						<div class="settings-section">
							<div class="setting-item-block">
								<label for="modal-global-context">Global Context (All Chats)</label>
								<p class="modal-help-subtext">
									Inject global instructions or persona rules. This text will be appended as system prompt prefix for ALL active chats.
								</p>
								<textarea 
									id="modal-global-context"
									placeholder="e.g. You are an expert Svelte 5 developer. Keep your responses short and use professional tone..." 
									bind:value={globalContext}
									rows="10"
									class="modal-textarea scrollbar-custom"
								></textarea>
							</div>
						</div>
					{:else if activeTab === 'storage'}
						<div class="settings-section">
							<div class="storage-stats-container">
								<h3>การใช้งานพื้นที่จัดเก็บข้อมูล (Storage Stats)</h3>
								<p class="modal-help-subtext">ข้อมูลทั้งหมดถูกเก็บไว้ภายในเว็บเบราว์เซอร์เครื่องของคุณเอง (Client-side IndexedDB)</p>
								
								<div class="stats-grid">
									<div class="stat-card">
										<span class="stat-num">{stats.chatsCount}</span>
										<span class="stat-label">ห้องสนทนา (Chats)</span>
									</div>
									<div class="stat-card">
										<span class="stat-num">{stats.projectsCount}</span>
										<span class="stat-label">โปรเจกต์ (Projects)</span>
									</div>
									<div class="stat-card">
										<span class="stat-num">{stats.canvasFilesCount}</span>
										<span class="stat-label">ไฟล์กระดาน Canvas</span>
									</div>
									<div class="stat-card">
										<span class="stat-num">{stats.memoriesCount}</span>
										<span class="stat-label">ความจำระบบ (Memories)</span>
									</div>
									<div class="stat-card upvote-card">
										<span class="stat-num">{stats.upvotesCount}</span>
										<span class="stat-label">คำตอบดี 👍</span>
									</div>
									<div class="stat-card downvote-card">
										<span class="stat-num">{stats.downvotesCount}</span>
										<span class="stat-label">คำตอบไม่ตรงประเด็น 👎</span>
									</div>
								</div>
							</div>

							<div class="storage-actions-card">
								<h3>การสำรองและกู้คืนข้อมูล (Backup & Restore)</h3>
								<p class="modal-help-subtext">เพื่อป้องกันข้อมูลสูญหายเมื่อล้างประวัติเบราว์เซอร์ คุณสามารถส่งออก (Export) ข้อมูลแชทและค่ากำหนดทั้งหมด และนำเข้ากลับมาใช้งานได้ในภายหลัง</p>
								
								<div class="actions-buttons-row">
									<button type="button" class="storage-action-btn export-btn" onclick={exportStorageData}>
										<svg viewBox="0 0 24 24" width="16" height="16">
											<path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
										</svg>
										ส่งออกข้อมูลทั้งหมด (Backup)
									</button>

									<button type="button" class="storage-action-btn import-btn" onclick={() => importFileInput?.click()}>
										<svg viewBox="0 0 24 24" width="16" height="16">
											<path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
										</svg>
										กู้คืนข้อมูลสำรอง (Restore)
									</button>
									<input 
										type="file" 
										accept=".json" 
										bind:this={importFileInput}
										onchange={handleRestoreData} 
										style="display: none;" 
									/>
								</div>
							</div>

							<div class="storage-danger-zone">
								<h3 class="danger-title">พื้นที่อันตราย (Danger Zone)</h3>
								<p class="modal-help-subtext">ลบข้อมูลทั้งหมดที่เก็บอยู่ในเบราว์เซอร์ รวมถึงแชท โปรเจกต์ ไฟล์ Canvas และ API keys ทั้งหมดอย่างถาวร</p>
								
								<button type="button" class="clear-data-btn" onclick={handleClearData}>
									<svg viewBox="0 0 24 24" width="16" height="16">
										<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
									</svg>
									ล้างข้อมูลระบบทั้งหมด (Clear All Data)
								</button>
							</div>
						</div>
					{:else if activeTab === 'roles'}
						<div class="settings-section">
							{#if editingRoleId === null}
								<!-- List View -->
								<div class="section-header-action-row">
									<div>
										<h3 class="section-title-alt">จัดการบทบาทโมเดล (Agent Roles)</h3>
										<p class="modal-help-subtext">กำหนดและปรับแต่ง Prompt ของผู้เชี่ยวชาญในด้านต่าง ๆ เพื่อสลับสไตล์คำตอบของบอท</p>
									</div>
									<button type="button" class="modal-action-btn add-role-btn" onclick={openNewRoleForm}>
										+ เพิ่มบทบาทใหม่
									</button>
								</div>

								<div class="roles-grid animate-fade-in">
									{#each roleStore.allRoles as role}
										<div class="role-card" class:custom-role-card={role.isCustom}>
											<div class="role-card-header">
												<div class="role-card-identity">
													<span class="role-card-icon">{role.icon || '🤖'}</span>
													<div>
														<h4 class="role-card-name">{role.name}</h4>
														{#if role.isCustom}
															<span class="badge badge-custom">Custom</span>
														{:else}
															<span class="badge badge-system">System</span>
														{/if}
													</div>
												</div>
												<div class="role-card-actions">
													<button type="button" class="role-action-icon-btn" onclick={() => handleDuplicateRole(role)} title="Duplicate / Copy">
														<svg viewBox="0 0 24 24" width="14" height="14">
															<path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
														</svg>
													</button>
													{#if role.isCustom}
														<button type="button" class="role-action-icon-btn" onclick={() => handleEditRole(role)} title="Edit">
															<svg viewBox="0 0 24 24" width="14" height="14">
																<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
															</svg>
														</button>
														<button type="button" class="role-action-icon-btn delete-btn" onclick={() => handleDeleteRole(role.id)} title="Delete">
															<svg viewBox="0 0 24 24" width="14" height="14">
																<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
															</svg>
														</button>
													{/if}
												</div>
											</div>
											<p class="role-card-desc">{role.desc || 'ไม่มีคำอธิบาย'}</p>
											{#if role.keywords}
												<div class="role-card-keywords">
													<span class="keywords-label">Keywords:</span>
													{#each role.keywords.split(',') as kw}
														{#if kw.trim()}
															<span class="keyword-tag">{kw.trim()}</span>
														{/if}
													{/each}
												</div>
											{/if}
											<details class="role-card-prompt-details">
												<summary>ดู System Prompt</summary>
												<div class="prompt-text-preview">{role.prompt}</div>
											</details>
										</div>
									{/each}
								</div>
							{:else}
								<!-- Edit/Add Form View -->
								<div class="role-form-container animate-zoom-in">
									<div class="form-header-row">
										<h3>
											{#if editingRoleId === 'new'}
												สร้างบทบาทใหม่ (Create Agent Role)
											{:else}
												แก้ไขบทบาท (Edit Agent Role)
											{/if}
										</h3>
										<button type="button" class="role-back-btn" onclick={() => editingRoleId = null}>
											← ย้อนกลับ
										</button>
									</div>

									<div class="role-form-grid">
										<div class="form-group-row">
											<div class="form-item-block role-icon-input-block">
												<label for="role-icon">Emoji ไอคอน</label>
												<input id="role-icon" type="text" class="modal-text-input" placeholder="🤖" bind:value={roleFormIcon} maxlength="5" />
											</div>
											<div class="form-item-block role-name-input-block">
												<label for="role-name">ชื่อบทบาท (Name)</label>
												<input id="role-name" type="text" class="modal-text-input" placeholder="เช่น Senior Python Engineer" bind:value={roleFormName} />
											</div>
										</div>

										<div class="setting-item-block">
											<label for="role-desc">คำอธิบายโดยย่อ (Description)</label>
											<input id="role-desc" type="text" class="modal-text-input" placeholder="เช่น ผู้เชี่ยวชาญสคริปต์และการคำนวณ" bind:value={roleFormDesc} />
										</div>

										<div class="setting-item-block">
											<label for="role-keywords">คำสำคัญสำหรับจัดสรรบทบาทอัตโนมัติ (Keywords - แยกด้วยเครื่องหมายจุลภาค ,)</label>
											<input id="role-keywords" type="text" class="modal-text-input" placeholder="เช่น python, django, pandas, numpy" bind:value={roleFormKeywords} />
											<p class="modal-help-subtext" style="margin-top: 4px;">เมื่อตรวจพบคำเหล่านี้ในคำถาม ระบบจะเรียกใช้ Prompt นี้อัตโนมัติ</p>
										</div>

										<div class="setting-item-block">
											<label for="role-prompt">คำสั่งระบบ (System Prompt / Instructions)</label>
											<textarea id="role-prompt" class="modal-textarea-input scrollbar-custom" placeholder="You are an expert technical assistant. Focus on..." bind:value={roleFormPrompt} rows="8"></textarea>
										</div>
									</div>

									<div class="form-actions-row">
										<button type="button" class="modal-secondary-btn" onclick={() => editingRoleId = null}>
											ยกเลิก
										</button>
										<button type="button" class="modal-action-btn" onclick={saveRole}>
											บันทึกข้อมูล
										</button>
									</div>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'models'}
						<div class="settings-section">
							<div class="section-header-action-row" style="margin-bottom: 16px;">
								<div>
									<h3 class="section-title-alt">จัดการโมเดลทั้งหมด (Model Favorites & Hiding)</h3>
									<p class="modal-help-subtext">ตั้งค่าโมเดลที่ต้องการปักหมุดไว้ด้านบนสุด หรือซ่อนโมเดลที่ไม่ต้องการแสดงในเมนูเลือกหลัก</p>
								</div>
								<div class="model-manager-search" style="width: 250px;">
									<input 
										type="text" 
										placeholder="ค้นหาโมเดล..." 
										class="modal-text-input" 
										bind:value={searchQuery} 
										style="padding: 6px 12px; font-size: 0.85rem;"
									/>
								</div>
							</div>

							<div class="models-manager-list scrollbar-custom" style="max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; padding-right: 4px;">
								{#each ['local', 'cloud', 'gemini'] as source}
									{@const sourceModels = models.filter((m: any) => {
										const mSource = m.source || (m.name.startsWith('gemini-') ? 'gemini' : 'local');
										return mSource === source && (!searchQuery.trim() || m.name.toLowerCase().includes(searchQuery.toLowerCase()));
									})}
									{#if sourceModels.length > 0}
										<div class="manager-source-group" style="display: flex; flex-direction: column; gap: 8px;">
											<h4 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; display: flex; align-items: center; gap: 8px;">
												<span>{source === 'local' ? 'Local Workstation' : source === 'cloud' ? 'Ollama Cloud' : 'Google Gemini'}</span>
												<span class="model-source-badge {source}" style="font-size: 0.65rem; border-radius: 4px; padding: 1px 6px;">{sourceModels.length} models</span>
											</h4>
											<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px;">
												{#each sourceModels as m}
													<div class="manager-model-row" class:is-hidden={hiddenModelNames.includes(m.name)} style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; transition: all var(--transition-fast); opacity: {hiddenModelNames.includes(m.name) ? '0.55' : '1'}; border-style: {hiddenModelNames.includes(m.name) ? 'dashed' : 'solid'};">
														<div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
															<span style="font-size: 0.85rem; font-weight: 550; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title={m.name}>{m.name}</span>
															{#if m.details?.parameter_size && m.details.parameter_size !== 'unknown'}
																<span style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">Size: {m.details.parameter_size} | Format: {m.details.format || 'gguf'}</span>
															{/if}
														</div>
														<div style="display: flex; align-items: center; gap: 8px;">
															<button 
																type="button" 
																class="manager-action-btn-icon" 
																class:active={pinnedModelNames.includes(m.name)} 
																onclick={() => togglePin(m.name)}
																title={pinnedModelNames.includes(m.name) ? "ถอนหมุดออกจากรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
																style="background: none; border: none; font-size: 1.15rem; color: {pinnedModelNames.includes(m.name) ? '#fdd663' : 'var(--text-muted)'}; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; transition: all var(--transition-fast);"
															>
																★
															</button>
															<button 
																type="button" 
																class="manager-action-btn-icon" 
																class:active={hiddenModelNames.includes(m.name)} 
																onclick={() => toggleHide(m.name)}
																title={hiddenModelNames.includes(m.name) ? "เลิกซ่อนและแสดงในรายการหลัก" : "ซ่อนจากรายการหลัก"}
																style="background: none; border: none; font-size: 1rem; color: {hiddenModelNames.includes(m.name) ? 'var(--text-muted)' : 'var(--text-primary)'}; opacity: {hiddenModelNames.includes(m.name) ? '0.5' : '0.85'}; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; transition: all var(--transition-fast);"
															>
																{#if hiddenModelNames.includes(m.name)}
																	<svg viewBox="0 0 24 24" width="16" height="16">
																		<path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.82l2.92 2.92c1.51-1.2 2.7-2.78 3.44-4.74-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
																	</svg>
																{:else}
																	<svg viewBox="0 0 24 24" width="16" height="16">
																		<path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
																	</svg>
																{/if}
															</button>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
<style>
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.connection-subtabs {
		display: flex;
		gap: 4px;
		background-color: var(--bg-tertiary);
		padding: 4px;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		margin-bottom: 12px;
	}

	.connection-subtab-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 8px 12px;
		background: none;
		border: none;
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.connection-subtab-btn:hover {
		color: var(--text-primary);
		background-color: rgba(255, 255, 255, 0.04);
	}

	.connection-subtab-btn.active {
		color: var(--text-primary);
		background-color: var(--bg-primary);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.subtab-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: var(--text-muted);
		transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.subtab-status-dot.active {
		background-color: #51cf66;
		box-shadow: 0 0 6px rgba(81, 207, 102, 0.6);
	}

	.test-btn-container {
		display: flex;
		justify-content: flex-end;
		margin-top: 14px;
	}

	.modal-action-btn {
		background-color: var(--accent-blue);
		color: var(--accent-text, var(--bg-primary));
		border: none;
		border-radius: 8px;
		padding: 10px 20px;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: background-color var(--transition-fast), transform 0.1s ease, box-shadow var(--transition-fast);
		box-shadow: 0 4px 12px rgba(168, 199, 250, 0.15);
	}

	.modal-action-btn:hover:not(:disabled) {
		background-color: var(--accent-blue-hover);
		transform: translateY(-1px);
	}

	.modal-action-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.modal-action-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Settings Modal Structure */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background-color: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(8px);
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow-y: auto;
		padding: 20px 10px;
		box-sizing: border-box;
		z-index: 10000; /* Ensure it stays above everything */
	}

	.settings-modal-content {
		width: 820px;
		max-width: 95vw;
		height: 600px;
		max-height: 85vh;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		box-shadow: var(--shadow-lg);
		display: flex;
		overflow: hidden;
		text-align: left;
		margin: auto;
	}

	/* Sidebar Styles */
	.settings-sidebar {
		width: 250px;
		background-color: var(--bg-primary);
		border-right: 1px solid var(--border-light);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.settings-brand {
		padding: 24px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-title);
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text-primary);
		border-bottom: 1px solid var(--border-light);
	}

	.settings-brand svg {
		color: var(--accent-blue);
		filter: drop-shadow(0 0 4px rgba(168, 199, 250, 0.4));
	}

	.settings-nav {
		padding: 16px 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		overflow-y: auto;
	}

	.nav-tab-btn {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: none;
		border: none;
		border-radius: 8px;
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.nav-tab-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.nav-tab-btn.active {
		background-color: color-mix(in srgb, var(--accent-blue) 12%, var(--bg-primary));
		border-left: 3px solid var(--accent-blue);
		border-radius: 0 8px 8px 0;
		color: var(--accent-blue);
		font-weight: 600;
	}

	.nav-tab-btn svg {
		flex-shrink: 0;
	}

	/* Content Area Styles */
	.settings-content-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0; /* Allow shrinking */
	}

	.settings-header {
		padding: 20px 24px;
		border-bottom: 1px solid var(--border-light);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.settings-header h2 {
		margin: 0;
		font-family: var(--font-title);
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.settings-close-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 6px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.settings-close-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.settings-body {
		flex: 1;
		padding: 24px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* Setting Items and Blocks */
	.setting-item-large {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.setting-title-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* API Service Card */
	.api-service-card {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		transition: border-color var(--transition-fast);
	}

	.api-service-card:focus-within {
		border-color: var(--accent-blue);
	}

	.api-service-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.api-service-info h4 {
		margin: 0 0 2px 0;
		font-family: var(--font-title);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.api-service-info p {
		margin: 0;
		font-size: 0.76rem;
		color: var(--text-muted);
		line-height: 1.35;
	}

	.api-service-body {
		border-top: 1px dashed var(--border-light);
		padding-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Status Alert — used in connection cards */
	.status-alert {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 6px;
		background-color: color-mix(in srgb, var(--text-muted) 8%, transparent);
		border: 1px solid var(--border-color);
		font-size: 0.78rem;
		color: var(--text-secondary);
		margin-top: 6px;
		transition: background-color var(--transition-fast), border-color var(--transition-fast);
	}

	.status-alert.success {
		background-color: color-mix(in srgb, #51cf66 10%, transparent);
		border-color: color-mix(in srgb, #51cf66 30%, transparent);
		color: #69db7c;
	}

	.status-alert.error {
		background-color: color-mix(in srgb, #ff6b6b 10%, transparent);
		border-color: color-mix(in srgb, #ff6b6b 30%, transparent);
		color: #ff8787;
	}

	.status-alert-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		background-color: var(--text-muted);
		transition: background-color var(--transition-fast);
	}

	.status-alert.success .status-alert-dot {
		background-color: #51cf66;
		box-shadow: 0 0 6px rgba(81, 207, 102, 0.6);
	}

	.status-alert.error .status-alert-dot {
		background-color: #ff6b6b;
		box-shadow: 0 0 6px rgba(255, 107, 107, 0.5);
	}


	.toggle-switch {
		position: relative;
		display: inline-block;
		width: 42px;
		height: 24px;
		flex-shrink: 0;
	}

	.toggle-switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: var(--bg-tertiary);
		transition: .2s ease;
		border-radius: 24px;
		border: 1px solid var(--border-color);
	}

	.toggle-slider:before {
		position: absolute;
		content: "";
		height: 16px;
		width: 16px;
		left: 3px;
		bottom: 3px;
		background-color: var(--text-muted);
		transition: .2s ease;
		border-radius: 50%;
	}

	.toggle-switch input:checked + .toggle-slider {
		background-color: rgba(168, 199, 250, 0.12);
		border-color: var(--accent-blue);
	}

	.toggle-switch input:checked + .toggle-slider:before {
		transform: translateX(18px);
		background-color: var(--accent-blue);
	}

	.setting-item-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.setting-item-block label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	/* Inputs & Buttons */
	.modal-input-group {
		display: flex;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		overflow: hidden;
		transition: border-color var(--transition-fast);
	}

	.modal-input-group:focus-within {
		border-color: var(--accent-blue);
	}

	.modal-input-group input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		padding: 10px 14px;
		color: var(--text-primary);
		font-size: 0.88rem;
		min-width: 0;
	}

	.modal-text-input {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		outline: none;
		padding: 10px 14px;
		color: var(--text-primary);
		font-size: 0.88rem;
		transition: border-color var(--transition-fast);
	}

	.modal-text-input:focus {
		border-color: var(--accent-blue);
	}

	.modal-refresh-btn {
		background-color: var(--bg-tertiary);
		border: none;
		border-left: 1px solid var(--border-color);
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 16px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.modal-refresh-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.modal-eye-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 0 14px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color var(--transition-fast);
	}

	.modal-eye-btn:hover {
		color: var(--text-primary);
	}

	/* Status Alerts */
	.status-alert {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.76rem;
		padding: 8px 12px;
		border-radius: 6px;
		margin-top: 4px;
	}

	.status-alert.success {
		background-color: rgba(81, 207, 102, 0.1);
		color: #51cf66;
	}

	.status-alert.error {
		background-color: rgba(255, 107, 107, 0.1);
		color: #ff6b6b;
	}

	.status-alert-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: currentColor;
	}

	.cors-help-card {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 14px;
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--text-secondary);
	}

	.cors-help-card h4 {
		margin: 0 0 8px 0;
		color: var(--text-primary);
		font-weight: 600;
	}

	.cors-help-card ol {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.cors-help-card pre {
		background-color: var(--bg-tertiary);
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid var(--border-light);
		margin: 4px 0;
		overflow-x: auto;
	}

	.cors-help-card code {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--accent-blue);
	}



	.model-chain-cards {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.chain-step-card {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 10px;
	}

	.chain-card-header {
		background-color: var(--bg-tertiary);
		padding: 8px 14px;
		border-bottom: 1px solid var(--border-light);
		display: flex;
		align-items: center;
		gap: 10px;
		border-top-left-radius: 9px;
		border-top-right-radius: 9px;
	}

	.chain-step-index {
		font-size: 0.74rem;
		font-weight: 700;
		background-color: var(--accent-blue);
		color: var(--bg-primary);
		padding: 2px 6px;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.chain-step-role {
		font-size: 0.74rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.chain-remove-btn {
		margin-left: auto;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.8rem;
		padding: 2px;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.chain-remove-btn:hover {
		background-color: rgba(255, 107, 107, 0.1);
		color: #ff6b6b;
	}

	.chain-card-body {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.modal-select {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.85rem;
		outline: none;
		transition: border-color var(--transition-fast);
		cursor: pointer;
	}

	.modal-select:focus {
		border-color: var(--accent-blue);
	}

	.chain-add-btn {
		background-color: var(--bg-primary);
		border: 1px dashed var(--border-color);
		border-radius: 10px;
		padding: 12px;
		color: var(--accent-blue);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--transition-fast), border-style var(--transition-fast);
	}

	.chain-add-btn:hover {
		background-color: var(--bg-hover);
		border-style: solid;
	}

	.chain-add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.inline-checkbox-wrapper {
		margin-top: 14px;
		padding-top: 14px;
		border-top: 1px solid var(--border-light);
	}

	.modal-checkbox-label {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		user-select: none;
	}



	.modal-help-subtext {
		margin: 4px 0 0 25px;
		font-size: 0.74rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	/* Sliders */
	.temp-slider-group {
		margin-top: 6px;
	}

	.setting-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.val-display-group {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.individual-reset-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.individual-reset-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.setting-val-tag {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--accent-blue);
		background-color: rgba(168, 199, 250, 0.08);
		padding: 2px 6px;
		border-radius: 4px;
		font-family: var(--font-mono);
	}

	.slider-wrapper {
		display: flex;
		align-items: center;
		padding: 4px 0;
	}

	.modal-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: var(--bg-tertiary);
		outline: none;
		cursor: pointer;
	}

	.modal-slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: var(--bg-tertiary);
	}

	.modal-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent-blue);
		cursor: pointer;
		margin-top: -4px;
		box-shadow: 0 0 6px rgba(168, 199, 250, 0.4);
		transition: transform var(--transition-fast), background-color var(--transition-fast);
	}

	.modal-slider::-webkit-slider-thumb:hover {
		background: var(--accent-blue-hover);
		transform: scale(1.2);
	}

	.modal-slider::-moz-range-track {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: var(--bg-tertiary);
	}

	.modal-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent-blue);
		cursor: pointer;
		border: none;
		box-shadow: 0 0 6px rgba(168, 199, 250, 0.4);
		transition: transform var(--transition-fast), background-color var(--transition-fast);
	}

	.modal-slider::-moz-range-thumb:hover {
		background: var(--accent-blue-hover);
		transform: scale(1.2);
	}

	/* Advanced Sliders */
	.fallback-warning-card {
		background-color: rgba(255, 193, 7, 0.08);
		border: 1px solid rgba(255, 193, 7, 0.2);
		border-radius: 8px;
		padding: 12px 16px;
		display: flex;
		gap: 12px;
		align-items: flex-start;
		color: #e2b200;
	}


	.advanced-sliders-container {
		display: flex;
		flex-direction: column;
		gap: 10px;
		transition: opacity 0.2s ease, pointer-events 0.2s ease;
	}

	.advanced-sliders-container.disabled-settings {
		opacity: 0.4;
		pointer-events: none;
		user-select: none;
	}

	.advanced-tuning-card {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 8px 12px;
	}

	.advanced-tuning-card label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	/* Textareas */
	.modal-textarea {
		width: 100%;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		outline: none;
		padding: 12px;
		color: var(--text-primary);
		font-size: 0.88rem;
		line-height: 1.45;
		resize: none;
		font-family: inherit;
		box-sizing: border-box;
		transition: border-color var(--transition-fast);
	}

	.modal-textarea:focus {
		border-color: var(--accent-blue);
	}

	/* Footer Styles */
	.settings-footer {
		padding: 16px 24px;
		border-top: 1px solid var(--border-light);
		background-color: var(--bg-tertiary);
		display: flex;
		justify-content: flex-end;
	}

	.settings-save-btn {
		background-color: var(--accent-blue);
		color: var(--accent-text, var(--bg-primary));
		border: none;
		border-radius: 8px;
		padding: 10px 20px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.settings-save-btn:hover {
		background-color: var(--accent-blue-hover);
	}

	.scrollbar-custom::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	.scrollbar-custom::-webkit-scrollbar-track {
		background: transparent;
	}

	.scrollbar-custom::-webkit-scrollbar-thumb {
		background: var(--border-color);
		border-radius: 3px;
	}

	.scrollbar-custom::-webkit-scrollbar-thumb:hover {
		background: var(--text-muted);
	}

	@media (max-width: 1024px) {
		.settings-modal-content {
			flex-direction: column;
			height: auto;
			max-height: none;
			width: 100%;
			max-width: calc(100vw - 20px);
			box-sizing: border-box;
			overflow: visible;
			margin: 20px auto;
		}

		.settings-content-wrapper {
			min-height: 0;
			flex: none;
		}

		.settings-sidebar {
			width: 100%;
			border-right: none;
			border-bottom: 1px solid var(--border-light);
		}

		.settings-brand {
			padding: 12px 16px;
			font-size: 1rem;
		}

		.settings-nav {
			flex-direction: row;
			padding: 6px 12px;
			gap: 6px;
			overflow-x: auto;
			white-space: nowrap;
			scrollbar-width: none;
		}

		.settings-nav::-webkit-scrollbar {
			display: none;
		}

		.nav-tab-btn {
			padding: 8px 12px;
			font-size: 0.8rem;
			border-radius: 6px;
		}

		.nav-tab-btn.active {
			border-left: none;
			border-bottom: 2px solid var(--accent-blue);
			border-radius: 6px 6px 0 0;
			background-color: rgba(168, 199, 250, 0.05);
		}

		.nav-tab-btn span {
			display: none;
		}

		.nav-tab-btn.active span {
			display: inline;
		}

		.settings-header {
			padding: 12px 16px;
		}

		.settings-body {
			padding: 16px;
			gap: 16px;
			overflow-y: visible;
			flex: none;
		}

		.connection-tabs-header {
			flex-direction: column;
		}
	}

	/* Custom select in settings modal styles */
	.custom-select-container {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.custom-select-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 8px 12px;
		color: var(--text-primary);
		font-size: 0.85rem;
		cursor: pointer;
		position: relative;
		transition: border-color var(--transition-fast);
	}

	.custom-select-trigger:hover {
		border-color: var(--border-light);
		background-color: var(--bg-hover);
	}

	.custom-select-trigger .trigger-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 90%;
	}

	.custom-select-dropdown {
		position: absolute;
		left: 0;
		top: 100%;
		margin-top: 4px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		width: 480px;
		max-width: calc(100vw - 32px);
		max-height: 320px;
		overflow: hidden;
		animation: dropdown-fade-in 0.12s ease-out;
	}

	@keyframes dropdown-fade-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.dropdown-search-wrapper {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-bottom: 1px solid var(--border-color);
		background-color: var(--bg-primary);
		position: relative;
	}

	.dropdown-search-wrapper input {
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 0.78rem;
		width: 100%;
		outline: none;
	}

	.dropdown-search-wrapper .search-icon {
		color: var(--text-muted);
	}

	.dropdown-search-wrapper .clear-search-btn {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px;
	}

	.dropdown-search-wrapper .clear-search-btn:hover {
		color: var(--text-primary);
	}

	.dropdown-tabs {
		display: flex;
		border-bottom: 1px solid var(--border-color);
		background-color: var(--bg-primary);
		padding: 2px 8px 0 8px;
		gap: 2px;
	}

	.dropdown-tab-btn {
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-secondary);
		padding: 6px 8px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}

	.dropdown-tab-btn:hover {
		color: var(--text-primary);
	}

	.dropdown-tab-btn.active {
		color: var(--accent-blue);
		border-bottom-color: var(--accent-blue);
	}

	.dropdown-list-container {
		overflow-y: auto;
		max-height: 250px;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.dropdown-group-header {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--text-muted);
		padding: 6px 6px 2px 6px;
		letter-spacing: 0.3px;
	}

	.dropdown-model-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		padding: 4px 2px;
	}

	.dropdown-model-card {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		padding: 5px 9px;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		cursor: pointer;
		transition: all var(--transition-fast);
		gap: 4px;
		position: relative;
	}

	.dropdown-model-card:hover {
		border-color: var(--border-light);
		background-color: var(--bg-hover);
	}

	.dropdown-model-card.selected {
		border-color: var(--accent-blue);
		background-color: color-mix(in srgb, var(--accent-blue) 8%, var(--bg-primary));
	}

	.dropdown-card-content {
		flex: 1;
		min-width: 0;
	}

	.dropdown-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.dropdown-name-text {
		font-size: 0.76rem;
		font-weight: 500;
		color: var(--text-primary);
		word-break: break-word;
		overflow-wrap: break-word;
		line-height: 1.25;
		flex: 1;
	}

	.dropdown-source-badge {
		font-size: 0.58rem;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 4px;
		text-transform: uppercase;
		flex-shrink: 0;
		border: 1px solid transparent;
	}

	.dropdown-source-badge.local {
		background-color: rgba(66, 133, 244, 0.1);
		color: var(--accent-blue);
		border-color: rgba(66, 133, 244, 0.2);
	}

	.dropdown-source-badge.cloud {
		background-color: rgba(168, 85, 247, 0.1);
		color: #a855f7;
		border-color: rgba(168, 85, 247, 0.2);
	}

	.dropdown-source-badge.gemini {
		background-color: rgba(234, 67, 53, 0.1);
		color: #ea4335;
		border-color: rgba(234, 67, 53, 0.2);
	}

	.dropdown-pin-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 2px 4px;
		line-height: 1;
		transition: color var(--transition-fast), transform 0.1s ease;
		flex-shrink: 0;
	}

	.dropdown-pin-btn:hover {
		color: var(--accent-yellow);
		transform: scale(1.15);
	}

	.dropdown-pin-btn.pinned {
		color: var(--accent-yellow);
	}

	.dropdown-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.dropdown-hide-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 2px 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color var(--transition-fast), transform 0.1s ease;
		flex-shrink: 0;
	}

	.dropdown-hide-btn:hover {
		color: var(--accent-blue);
		transform: scale(1.15);
	}

	.dropdown-hide-btn.hidden-active {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.dropdown-model-card.dropdown-model-hidden {
		opacity: 0.5;
		border-style: dashed;
	}

	.dropdown-model-card.dropdown-model-hidden:hover {
		opacity: 0.85;
	}

	.dropdown-empty {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-align: center;
		padding: 8px 0;
	}

	@media (max-width: 480px) {
		.dropdown-model-grid {
			grid-template-columns: 1fr;
		}
		.custom-select-dropdown {
			width: 290px;
		}
	}

	/* Storage section styles */
	.storage-stats-container {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 24px;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	@media (min-width: 600px) {
		.stats-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.stat-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 6px;
	}

	.stat-card.upvote-card .stat-num {
		color: #4caf50;
	}

	.stat-card.downvote-card .stat-num {
		color: #f44336;
	}

	.stat-num {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent-blue);
	}

	.stat-label {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.storage-actions-card, .storage-danger-zone {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.actions-buttons-row {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (min-width: 600px) {
		.actions-buttons-row {
			flex-direction: row;
		}
	}

	.storage-action-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		font-size: 0.85rem;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
		transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
	}

	.storage-action-btn.export-btn {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		color: var(--text-primary);
	}

	.storage-action-btn.export-btn:hover {
		background-color: var(--bg-hover);
		border-color: var(--border-light);
	}

	.storage-action-btn.import-btn {
		background-color: var(--accent-blue);
		border: none;
		color: white;
	}

	.storage-action-btn.import-btn:hover {
		background-color: var(--accent-blue-hover);
	}

	.storage-danger-zone {
		border-color: rgba(217, 101, 112, 0.4);
		background-color: rgba(217, 101, 112, 0.02);
	}

	.danger-title {
		color: #d96570 !important;
	}

	.clear-data-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background-color: #d96570;
		border: none;
		color: white;
		border-radius: 6px;
		padding: 10px 16px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		align-self: flex-start;
		transition: background-color var(--transition-fast);
	}

	.clear-data-btn:hover {
		background-color: #e5737d;
	}

	/* Agent Roles Styles */
	.section-header-action-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
		gap: 16px;
	}

	.section-title-alt {
		font-family: var(--font-title);
		font-weight: 600;
		font-size: 1.2rem;
		color: var(--text-primary);
		margin: 0 0 4px 0;
	}

	.add-role-btn {
		white-space: nowrap;
		padding: 8px 16px !important;
		font-size: 0.85rem !important;
	}

	.roles-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
		margin-bottom: 24px;
	}

	.role-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.role-card:hover {
		border-color: var(--border-light);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.role-card.custom-role-card {
		border-color: rgba(168, 199, 250, 0.25);
		background: linear-gradient(145deg, var(--bg-secondary) 0%, rgba(168, 199, 250, 0.02) 100%);
	}

	.role-card.custom-role-card:hover {
		border-color: var(--accent-blue);
		box-shadow: 0 4px 16px rgba(168, 199, 250, 0.08);
	}

	.role-card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.role-card-identity {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.role-card-icon {
		font-size: 1.8rem;
		min-width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--bg-tertiary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
	}

	.role-card-name {
		font-family: var(--font-title);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 2px 0;
	}

	.badge-system, .badge-custom {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 4px;
		text-transform: uppercase;
		display: inline-block;
	}

	.badge-system {
		background-color: rgba(107, 114, 128, 0.15);
		color: var(--text-secondary);
		border: 1px solid rgba(107, 114, 128, 0.25);
	}

	.badge-custom {
		background-color: rgba(168, 199, 250, 0.15);
		color: var(--accent-blue);
		border: 1px solid rgba(168, 199, 250, 0.25);
	}

	.role-card-actions {
		display: flex;
		gap: 4px;
	}

	.role-action-icon-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 6px;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.role-action-icon-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.role-action-icon-btn.delete-btn:hover {
		background-color: rgba(217, 101, 112, 0.15);
		color: #d96570;
	}

	.role-card-desc {
		font-size: 0.8rem;
		color: var(--text-secondary);
		line-height: 1.4;
		margin: 0;
		flex-grow: 1;
	}

	.role-card-keywords {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
		margin-top: 4px;
	}

	.keywords-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		margin-right: 2px;
	}

	.keyword-tag {
		font-size: 0.7rem;
		background-color: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		padding: 2px 6px;
		border-radius: 4px;
	}

	.role-card-prompt-details {
		border-top: 1px solid var(--border-color);
		padding-top: 8px;
		margin-top: 4px;
	}

	.role-card-prompt-details summary {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--accent-blue);
		cursor: pointer;
		user-select: none;
		outline: none;
	}

	.role-card-prompt-details summary:hover {
		text-decoration: underline;
	}

	.prompt-text-preview {
		margin-top: 8px;
		background-color: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 0.75rem;
		font-family: var(--font-mono, monospace);
		color: var(--text-secondary);
		white-space: pre-wrap;
		max-height: 120px;
		overflow-y: auto;
		line-height: 1.4;
	}

	/* Role Form Styles */
	.role-form-container {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.form-header-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 12px;
	}

	.form-header-row h3 {
		font-family: var(--font-title);
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.role-back-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.role-back-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.role-form-grid {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.form-group-row {
		display: flex;
		gap: 12px;
	}

	.role-icon-input-block {
		width: 100px;
	}

	.role-name-input-block {
		flex: 1;
	}

	.form-item-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.modal-textarea-input {
		width: 100%;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 12px;
		color: var(--text-primary);
		font-size: 0.88rem;
		outline: none;
		resize: vertical;
		font-family: inherit;
		line-height: 1.45;
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.modal-textarea-input:focus {
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 2px rgba(168, 199, 250, 0.15);
	}

	.form-actions-row {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		border-top: 1px solid var(--border-color);
		padding-top: 16px;
	}

	.modal-secondary-btn {
		background-color: transparent;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		padding: 8px 16px;
		font-size: 0.85rem;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.modal-secondary-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	/* ── Nav Section Labels & Divider ── */
	.nav-section-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
		padding: 8px 16px 4px 16px;
		user-select: none;
	}

	.nav-section-label-advanced {
		color: var(--text-muted);
		opacity: 0.8;
	}

	.nav-divider {
		height: 1px;
		background-color: var(--border-color);
		margin: 8px 12px;
	}

	.nav-tab-advanced {
		opacity: 0.75;
	}

	.nav-tab-advanced:hover,
	.nav-tab-advanced.active {
		opacity: 1;
	}

	/* ── Workspace Bridge Accordion ── */
	.workspace-bridge-accordion {
		border: 1px solid var(--border-color);
		border-radius: 10px;
		background-color: var(--bg-secondary);
		overflow: hidden;
	}

	.ws-accordion-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		user-select: none;
	}

	.ws-accordion-header:hover {
		background-color: var(--bg-hover);
	}

	/* ── Chain Info Banner ── */
	.chain-info-banner {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		background-color: color-mix(in srgb, var(--accent-blue) 6%, var(--bg-secondary));
		border: 1px solid color-mix(in srgb, var(--accent-blue) 20%, var(--border-color));
		border-radius: 10px;
		padding: 14px 16px;
		margin-bottom: 20px;
	}

	.chain-info-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
		margin-top: 2px;
	}

	/* ── Advanced Hero Card ── */
	.advanced-hero-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		border-radius: 12px;
		border: 2px solid var(--border-color);
		background-color: var(--bg-secondary);
		margin-bottom: 20px;
		transition: border-color var(--transition-fast), background-color var(--transition-fast);
	}

	.advanced-hero-card.advanced-hero-on {
		border-color: color-mix(in srgb, var(--accent-blue) 50%, var(--border-color));
		background-color: color-mix(in srgb, var(--accent-blue) 5%, var(--bg-secondary));
	}

	.advanced-hero-left {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		flex: 1;
	}

	.advanced-hero-icon {
		font-size: 1.8rem;
		flex-shrink: 0;
	}

	.advanced-hero-title {
		margin: 0 0 4px 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-title);
	}

	.advanced-hero-desc {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-secondary);
		line-height: 1.45;
	}

	/* ── Advanced Summary Grid (read-only values) ── */
	.advanced-summary-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-bottom: 20px;
	}

	@media (max-width: 600px) {
		.advanced-summary-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.advanced-summary-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		gap: 4px;
		text-align: center;
	}

	.advanced-summary-label {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		color: var(--text-muted);
	}

	.advanced-summary-val {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent-blue);
		font-family: var(--font-mono, monospace);
	}

	/* Mobile overrides for nav labels in horizontal mode */
	@media (max-width: 1024px) {
		.nav-section-label {
			display: none;
		}
		.nav-divider {
			display: none;
		}
		.nav-tab-advanced {
			opacity: 1;
		}
		.advanced-summary-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>

