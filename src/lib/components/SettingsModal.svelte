<script lang="ts">
	import type { OllamaModel } from '$lib/types';
	import { fade, scale } from 'svelte/transition';

	let {
		isSettingsOpen = $bindable(false),
		ollamaUrl = $bindable(),
		ollamaCloudUrl = $bindable(),
		ollamaCloudApiKey = $bindable(),
		geminiApiKey = $bindable(),
		enableOllamaLocal = $bindable(),
		enableOllamaCloud = $bindable(),
		enableGemini = $bindable(),
		activeModels = $bindable(),
		modelTemperatures = $bindable(),
		topP = $bindable(),
		topK = $bindable(),
		numCtx = $bindable(),
		numPredict = $bindable(),
		repeatPenalty = $bindable(),
		customizeSettings = $bindable(),
		globalContext = $bindable(),
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
		activeModels: string[];
		modelTemperatures: number[];
		topP: number;
		topK: number;
		numCtx: number;
		numPredict: number;
		repeatPenalty: number;
		customizeSettings: boolean;
		globalContext: string;
		isConnected: boolean;
		isOllamaCloudConnected: boolean;
		models: (OllamaModel & { source?: 'local' | 'cloud' | 'gemini' })[];
		onRefreshModels: () => void;
	}>();

	import { fetchModels } from '$lib/ollama';

	let activeTab = $state<'connections' | 'chain' | 'advanced' | 'context'>('connections');
	let selectedConnectionTab = $state<'local' | 'cloud' | 'gemini'>('local');
	let showOllamaCloudKey = $state(false);
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

	function handleLocalToggle(service: 'local' | 'cloud' | 'gemini', checked: boolean) {
		if (service === 'local') {
			localEnableOllamaLocal = checked;
			if (!checked) {
				enableOllamaLocal = false;
				localStatusLocal = { type: 'idle', message: '' };
				onRefreshModels();
			}
		} else if (service === 'cloud') {
			localEnableOllamaCloud = checked;
			if (!checked) {
				enableOllamaCloud = false;
				localStatusCloud = { type: 'idle', message: '' };
				onRefreshModels();
			}
		} else if (service === 'gemini') {
			localEnableGemini = checked;
			if (!checked) {
				enableGemini = false;
				localStatusGemini = { type: 'idle', message: '' };
				onRefreshModels();
			}
		}
	}

	// Auto-validate Ollama Local in background
	$effect(() => {
		if (localEnableOllamaLocal && ollamaUrl) {
			const url = ollamaUrl;
			const timer = setTimeout(async () => {
				testingLocal = true;
				localStatusLocal = { type: 'idle', message: 'กำลังตรวจสอบการเชื่อมต่อ... (Verifying...)' };
				try {
					const fetched = await fetchModels(url);
					enableOllamaLocal = true;
					const count = fetched.filter(m => !m.name.includes('gemini') && !m.name.includes('cloud')).length;
					localStatusLocal = { type: 'success', message: `เชื่อมต่อสำเร็จ! โหลดโมเดลทั้งหมด ${count} ตัว` };
					onRefreshModels();
				} catch (error: any) {
					enableOllamaLocal = false;
					const errMsg = error?.message || 'เชื่อมต่อล้มเหลว ตรวจสอบว่าเปิด Ollama หรือยัง และตั้งค่า CORS ถูกต้องหรือไม่';
					localStatusLocal = { type: 'error', message: errMsg };
				} finally {
					testingLocal = false;
				}
			}, 600);
			return () => clearTimeout(timer);
		} else {
			enableOllamaLocal = false;
			localStatusLocal = { type: 'idle', message: '' };
		}
	});

	// Auto-validate Ollama Cloud in background
	$effect(() => {
		if (localEnableOllamaCloud && ollamaCloudUrl && ollamaCloudApiKey) {
			const url = ollamaCloudUrl;
			const key = ollamaCloudApiKey;
			const timer = setTimeout(async () => {
				testingCloud = true;
				localStatusCloud = { type: 'idle', message: 'กำลังทดสอบการเชื่อมต่อ... (Verifying...)' };
				try {
					const fetched = await fetchModels(url, key);
					enableOllamaCloud = true;
					const count = fetched.length;
					localStatusCloud = { type: 'success', message: `เชื่อมต่อ Ollama Cloud สำเร็จ! โหลดโมเดล ${count} ตัว` };
					onRefreshModels();
				} catch (error: any) {
					enableOllamaCloud = false;
					const errMsg = error?.message || 'เชื่อมต่อ Ollama Cloud ล้มเหลว ตรวจสอบ URL และ API Key';
					localStatusCloud = { type: 'error', message: errMsg };
				} finally {
					testingCloud = false;
				}
			}, 600);
			return () => clearTimeout(timer);
		} else {
			enableOllamaCloud = false;
			localStatusCloud = { type: 'idle', message: '' };
		}
	});

	// Auto-validate Gemini Key in background
	$effect(() => {
		if (localEnableGemini && geminiApiKey) {
			const key = geminiApiKey;
			const timer = setTimeout(async () => {
				testingGemini = true;
				localStatusGemini = { type: 'idle', message: 'กำลังตรวจสอบ API Key... (Verifying...)' };
				try {
					const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
					if (!res.ok) {
						const errData = await res.json().catch(() => ({}));
						throw new Error(errData.error?.message || `HTTP error ${res.status}`);
					}
					enableGemini = true;
					localStatusGemini = { type: 'success', message: 'ตรวจสอบ Google Gemini API Key สำเร็จ!' };
					onRefreshModels();
				} catch (error: any) {
					enableGemini = false;
					const errMsg = error?.message || 'ตรวจสอบ API Key ล้มเหลว กรุณาเช็คความถูกต้องของ API Key';
					localStatusGemini = { type: 'error', message: errMsg };
				} finally {
					testingGemini = false;
				}
			}, 600);
			return () => clearTimeout(timer);
		} else {
			enableGemini = false;
			localStatusGemini = { type: 'idle', message: '' };
		}
	});

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
			loadPinned();
			window.addEventListener('pinned_models_updated', loadPinned);
			return () => window.removeEventListener('pinned_models_updated', loadPinned);
		}
	});

	function togglePin(modelName: string, e: MouseEvent) {
		e.stopPropagation();
		if (pinnedModelNames.includes(modelName)) {
			pinnedModelNames = pinnedModelNames.filter(name => name !== modelName);
		} else {
			pinnedModelNames = [...pinnedModelNames, modelName];
		}
		localStorage.setItem('pinned_models', JSON.stringify(pinnedModelNames));
		window.dispatchEvent(new Event('pinned_models_updated'));
	}

	let filteredDropdownModels = $derived(
		models.filter(m => !searchQuery.trim() || m.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	let pinnedDropdownModels = $derived(
		filteredDropdownModels.filter(m => pinnedModelNames.includes(m.name))
	);

	let localDropdownModels = $derived(
		filteredDropdownModels.filter(m => m.source === 'local' || (!m.source && !m.name.startsWith('gemini-')))
	);

	let cloudDropdownModels = $derived(
		filteredDropdownModels.filter(m => m.source === 'cloud')
	);

	let geminiDropdownModels = $derived(
		filteredDropdownModels.filter(m => m.source === 'gemini' || (!m.source && m.name.startsWith('gemini-')))
	);
</script>

{#if isSettingsOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div 
		class="modal-backdrop" 
		onclick={closeSettings} 
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
					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'connections'} 
						onclick={() => activeTab = 'connections'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H5v-2h6V7h2v4h4v2z"/>
						</svg>
						<span>Connections & APIs</span>
					</button>

					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'chain'} 
						onclick={() => activeTab = 'chain'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M17 16h-4v-2h4c1.1 0 2-.9 2-2s-.9-2-2-2h-4V8h4c2.2 0 4 1.8 4 4s-1.8 4-4 4zm-6-2H7c-1.1 0-2-.9-2-2s.9-2 2-2h4V8H7c-2.2 0-4 1.8-4 4s1.8 4 4 4h4v-2zm-3-3h8v2H8v-2z"/>
						</svg>
						<span>Model Chain Configuration</span>
					</button>

					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'advanced'} 
						onclick={() => activeTab = 'advanced'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M12.91 4.29l7.8 7.8c.39.39.39 1.02 0 1.41l-7.8 7.8c-.39.39-1.02.39-1.41 0l-7.8-7.8c-.39-.39-.39-1.02 0-1.41l7.8-7.8c.39-.39 1.03-.39 1.41 0zM12 7a5 5 0 100 10 5 5 0 000-10zm0 8a3 3 0 110-6 3 3 0 010 6z"/>
						</svg>
						<span>Advanced Parameters</span>
					</button>

					<button 
						class="nav-tab-btn" 
						class:active={activeTab === 'context'} 
						onclick={() => activeTab = 'context'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16">
							<path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
						</svg>
						<span>Global Context</span>
					</button>
				</nav>
			</div>

			<!-- Main Content -->
			<div class="settings-content-wrapper">
				<div class="settings-header">
					<h2>
						{#if activeTab === 'connections'}
							Connections & APIs
						{:else if activeTab === 'chain'}
							Model Chain Configuration
						{:else if activeTab === 'advanced'}
							Advanced Parameters
						{:else if activeTab === 'context'}
							Global System Context
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
							<!-- Connection Sub-tabs -->
							<div class="connection-subtabs">
								<button 
									type="button"
									class="connection-subtab-btn" 
									class:active={selectedConnectionTab === 'local'} 
									onclick={() => selectedConnectionTab = 'local'}
								>
									<span class="subtab-status-dot" class:active={enableOllamaLocal}></span>
									<span>Ollama (Local)</span>
								</button>
								<button 
									type="button"
									class="connection-subtab-btn" 
									class:active={selectedConnectionTab === 'cloud'} 
									onclick={() => selectedConnectionTab = 'cloud'}
								>
									<span class="subtab-status-dot" class:active={enableOllamaCloud}></span>
									<span>Ollama (Cloud)</span>
								</button>
								<button 
									type="button"
									class="connection-subtab-btn" 
									class:active={selectedConnectionTab === 'gemini'} 
									onclick={() => selectedConnectionTab = 'gemini'}
								>
									<span class="subtab-status-dot" class:active={enableGemini}></span>
									<span>Gemini (Cloud)</span>
								</button>
							</div>

							<div class="connection-subtab-content">
								{#if selectedConnectionTab === 'local'}
									<!-- Ollama Local -->
									<div class="api-service-card">
										<div class="api-service-header">
											<div class="api-service-info">
												<h4>Ollama (Local Workstation)</h4>
												<p>Execute open-source LLMs locally on your machine</p>
											</div>
											<label class="toggle-switch">
												<input type="checkbox" checked={localEnableOllamaLocal} onchange={(e) => handleLocalToggle('local', e.currentTarget.checked)} />
												<span class="toggle-slider"></span>
											</label>
										</div>
										{#if localEnableOllamaLocal}
											<div class="api-service-body animate-fade-in">
												<div class="setting-item-block">
													<label for="modal-ollama-url">Ollama Server URL</label>
													<div class="modal-input-group">
														<input 
															id="modal-ollama-url"
															type="text" 
															placeholder="http://localhost:11434" 
															bind:value={ollamaUrl}
														/>
													</div>
													<div class="status-alert" class:success={enableOllamaLocal} class:error={!enableOllamaLocal}>
														<span class="status-alert-dot"></span>
														<span>{localStatusLocal.message || (enableOllamaLocal ? `เชื่อมต่อสำเร็จ (Connected).` : 'ไม่ได้เชื่อมต่อ หรืออยู่ระหว่างรอการตรวจสอบ (Disconnected or waiting for verification).')}</span>
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
										{/if}
									</div>
								{:else if selectedConnectionTab === 'cloud'}
									<!-- Ollama Cloud -->
									<div class="api-service-card">
										<div class="api-service-header">
											<div class="api-service-info">
												<h4>Ollama Cloud</h4>
												<p>Connect to a hosted/remote Ollama endpoint</p>
											</div>
											<label class="toggle-switch">
												<input type="checkbox" checked={localEnableOllamaCloud} onchange={(e) => handleLocalToggle('cloud', e.currentTarget.checked)} />
												<span class="toggle-slider"></span>
											</label>
										</div>
										{#if localEnableOllamaCloud}
											<div class="api-service-body animate-fade-in">
												<div class="setting-item-block">
													<label for="modal-ollama-cloud-url">Ollama Cloud Base URL</label>
													<input 
														id="modal-ollama-cloud-url"
														type="text" 
														class="modal-text-input"
														placeholder="https://ollama.com" 
														bind:value={ollamaCloudUrl}
													/>
												</div>

												<div class="setting-item-block" style="margin-top: 10px;">
													<label for="modal-ollama-cloud-key">Ollama Cloud API Key</label>
													<div class="modal-input-group">
														<input 
															id="modal-ollama-cloud-key"
															type={showOllamaCloudKey ? 'text' : 'password'} 
															placeholder="Ollama Cloud API Key..." 
															bind:value={ollamaCloudApiKey}
														/>
														<button 
															class="modal-eye-btn" 
															onclick={() => showOllamaCloudKey = !showOllamaCloudKey} 
															title={showOllamaCloudKey ? 'Hide API Key' : 'Show API Key'}
														>
															{#if showOllamaCloudKey}
																<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
															{:else}
																<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
															{/if}
														</button>
													</div>
													<div class="status-alert" class:success={enableOllamaCloud} class:error={!enableOllamaCloud}>
														<span class="status-alert-dot"></span>
														<span>{localStatusCloud.message || (enableOllamaCloud ? 'เชื่อมต่อ Ollama Cloud สำเร็จ (Connected).' : 'ไม่ได้เชื่อมต่อ หรืออยู่ระหว่างรอการตรวจสอบ (Disconnected or waiting for verification).')}</span>
													</div>
												</div>
											</div>
										{/if}
									</div>
								{:else if selectedConnectionTab === 'gemini'}
									<!-- Gemini Cloud -->
									<div class="api-service-card">
										<div class="api-service-header">
											<div class="api-service-info">
												<h4>Google Gemini (Cloud)</h4>
												<p>Connect directly to official Gemini API Studio models</p>
											</div>
											<label class="toggle-switch">
												<input type="checkbox" checked={localEnableGemini} onchange={(e) => handleLocalToggle('gemini', e.currentTarget.checked)} />
												<span class="toggle-slider"></span>
											</label>
										</div>
										{#if localEnableGemini}
											<div class="api-service-body animate-fade-in">
												<div class="setting-item-block">
													<label for="modal-gemini-key">Google Gemini API Key</label>
													<div class="modal-input-group">
														<input 
															id="modal-gemini-key"
															type={showGeminiKey ? 'text' : 'password'} 
															placeholder="AI Studio Gemini API Key..." 
															bind:value={geminiApiKey}
														/>
														<button 
															class="modal-eye-btn" 
															onclick={() => showGeminiKey = !showGeminiKey} 
															title={showGeminiKey ? 'Hide API Key' : 'Show API Key'}
														>
															{#if showGeminiKey}
																<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
															{:else}
																<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
															{/if}
														</button>
													</div>
													<div class="status-alert" class:success={enableGemini} class:error={!enableGemini}>
														<span class="status-alert-dot"></span>
														<span>{localStatusGemini.message || (enableGemini ? 'Google Gemini API Key พร้อมใช้งาน (Active).' : 'ไม่ได้เปิดใช้งาน หรืออยู่ระหว่างรอการตรวจสอบ (Disconnected or waiting for verification).')}</span>
													</div>
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					{:else if activeTab === 'chain'}
						<div class="settings-section">
							<div class="setting-item-block">
								<div class="model-chain-intro">
									<h3>Multi-Model Execution Chain (โครงสร้างการต่อสายโมเดล)</h3>
								</div>
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
															{#if activeDropdownTab === 'all'}
																<!-- Pinned Section -->
																{#if pinnedDropdownModels.length > 0}
																	<div class="dropdown-group-header">ที่ปักหมุดไว้</div>
																	<div class="dropdown-model-grid">
																		{#each pinnedDropdownModels as m}
																			<div 
																				class="dropdown-model-card" 
																				class:selected={model === m.name}
																				onclick={() => {
																					updateModelStep(idx, m.name);
																					activeDropdownIdx = null;
																				}}
																			>
																				<div class="dropdown-card-content">
																					<div class="dropdown-name-row">
																						<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																						<span class="dropdown-source-badge {m.source || 'local'}">
																							{m.source === 'gemini' ? 'G' : m.source === 'cloud' ? 'C' : 'L'}
																						</span>
																					</div>
																				</div>
																				<button 
																					type="button"
																					class="dropdown-pin-btn pinned" 
																					onclick={(e) => togglePin(m.name, e)}
																					title="ถอนหมุดโมเดล"
																				>
																					★
																				</button>
																			</div>
																		{/each}
																	</div>
																{/if}

																<!-- Local Section -->
																{#if localDropdownModels.length > 0}
																	<div class="dropdown-group-header">Local (Ollama Local)</div>
																	<div class="dropdown-model-grid">
																		{#each localDropdownModels as m}
																			<div 
																				class="dropdown-model-card" 
																				class:selected={model === m.name}
																				onclick={() => {
																					updateModelStep(idx, m.name);
																					activeDropdownIdx = null;
																				}}
																			>
																				<div class="dropdown-card-content">
																					<div class="dropdown-name-row">
																						<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																						<span class="dropdown-source-badge local">L</span>
																					</div>
																				</div>
																				<button 
																					type="button"
																					class="dropdown-pin-btn" 
																					class:pinned={pinnedModelNames.includes(m.name)}
																					onclick={(e) => togglePin(m.name, e)}
																					title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																				>
																					★
																				</button>
																			</div>
																		{/each}
																	</div>
																{/if}

																<!-- Cloud Section -->
																{#if cloudDropdownModels.length > 0}
																	<div class="dropdown-group-header">Cloud (Ollama Cloud)</div>
																	<div class="dropdown-model-grid">
																		{#each cloudDropdownModels as m}
																			<div 
																				class="dropdown-model-card" 
																				class:selected={model === m.name}
																				onclick={() => {
																					updateModelStep(idx, m.name);
																					activeDropdownIdx = null;
																				}}
																			>
																				<div class="dropdown-card-content">
																					<div class="dropdown-name-row">
																						<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																						<span class="dropdown-source-badge cloud">C</span>
																					</div>
																				</div>
																				<button 
																					type="button"
																					class="dropdown-pin-btn" 
																					class:pinned={pinnedModelNames.includes(m.name)}
																					onclick={(e) => togglePin(m.name, e)}
																					title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																				>
																					★
																				</button>
																			</div>
																		{/each}
																	</div>
																{/if}

																<!-- Gemini Section -->
																{#if geminiDropdownModels.length > 0}
																	<div class="dropdown-group-header">Gemini (Google Gemini)</div>
																	<div class="dropdown-model-grid">
																		{#each geminiDropdownModels as m}
																			<div 
																				class="dropdown-model-card" 
																				class:selected={model === m.name}
																				onclick={() => {
																					updateModelStep(idx, m.name);
																					activeDropdownIdx = null;
																				}}
																			>
																				<div class="dropdown-card-content">
																					<div class="dropdown-name-row">
																						<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																						<span class="dropdown-source-badge gemini">G</span>
																					</div>
																				</div>
																				<button 
																					type="button"
																					class="dropdown-pin-btn" 
																					class:pinned={pinnedModelNames.includes(m.name)}
																					onclick={(e) => togglePin(m.name, e)}
																					title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																				>
																					★
																				</button>
																			</div>
																		{/each}
																	</div>
																{/if}

																{#if filteredDropdownModels.length === 0}
																	<div class="dropdown-empty">ไม่พบโมเดลที่ค้นหา</div>
																{/if}

															{:else}
																<!-- Individual Tabs -->
																{#if activeDropdownTab === 'local'}
																	{#if localDropdownModels.length > 0}
																		<!-- Pinned Local Section -->
																		{#if localDropdownModels.filter(m => pinnedModelNames.includes(m.name)).length > 0}
																			<div class="dropdown-group-header">ที่ปักหมุดไว้</div>
																			<div class="dropdown-model-grid" style="margin-bottom: 6px;">
																				{#each localDropdownModels.filter(m => pinnedModelNames.includes(m.name)) as m}
																					<div 
																						class="dropdown-model-card" 
																						class:selected={model === m.name}
																						onclick={() => {
																							updateModelStep(idx, m.name);
																							activeDropdownIdx = null;
																						}}
																					>
																						<div class="dropdown-card-content">
																							<div class="dropdown-name-row">
																								<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																								<span class="dropdown-source-badge local">L</span>
																							</div>
																						</div>
																						<button 
																							type="button"
																							class="dropdown-pin-btn pinned" 
																							onclick={(e) => togglePin(m.name, e)}
																							title="ถอนหมุดโมเดล"
																						>
																							★
																						</button>
																					</div>
																				{/each}
																			</div>
																			<div class="dropdown-group-header">โมเดลทั้งหมด</div>
																		{/if}

																		<div class="dropdown-model-grid">
																			{#each localDropdownModels as m}
																				<div 
																					class="dropdown-model-card" 
																					class:selected={model === m.name}
																					onclick={() => {
																						updateModelStep(idx, m.name);
																						activeDropdownIdx = null;
																					}}
																				>
																					<div class="dropdown-card-content">
																						<div class="dropdown-name-row">
																							<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																							<span class="dropdown-source-badge local">L</span>
																						</div>
																					</div>
																					<button 
																						type="button"
																						class="dropdown-pin-btn" 
																						class:pinned={pinnedModelNames.includes(m.name)}
																						onclick={(e) => togglePin(m.name, e)}
																						title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																					>
																						★
																					</button>
																				</div>
																			{/each}
																		</div>
																	{:else}
																		<div class="dropdown-empty">ไม่พบโมเดล Local</div>
																	{/if}
																{:else if activeDropdownTab === 'cloud'}
																	{#if cloudDropdownModels.length > 0}
																		<!-- Pinned Cloud Section -->
																		{#if cloudDropdownModels.filter(m => pinnedModelNames.includes(m.name)).length > 0}
																			<div class="dropdown-group-header">ที่ปักหมุดไว้</div>
																			<div class="dropdown-model-grid" style="margin-bottom: 6px;">
																				{#each cloudDropdownModels.filter(m => pinnedModelNames.includes(m.name)) as m}
																					<div 
																						class="dropdown-model-card" 
																						class:selected={model === m.name}
																						onclick={() => {
																							updateModelStep(idx, m.name);
																							activeDropdownIdx = null;
																						}}
																					>
																						<div class="dropdown-card-content">
																							<div class="dropdown-name-row">
																								<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																								<span class="dropdown-source-badge cloud">C</span>
																							</div>
																						</div>
																						<button 
																							type="button"
																							class="dropdown-pin-btn pinned" 
																							onclick={(e) => togglePin(m.name, e)}
																							title="ถอนหมุดโมเดล"
																						>
																							★
																						</button>
																					</div>
																				{/each}
																			</div>
																			<div class="dropdown-group-header">โมเดลทั้งหมด</div>
																		{/if}

																		<div class="dropdown-model-grid">
																			{#each cloudDropdownModels as m}
																				<div 
																					class="dropdown-model-card" 
																					class:selected={model === m.name}
																					onclick={() => {
																						updateModelStep(idx, m.name);
																						activeDropdownIdx = null;
																					}}
																				>
																					<div class="dropdown-card-content">
																						<div class="dropdown-name-row">
																							<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																							<span class="dropdown-source-badge cloud">C</span>
																						</div>
																					</div>
																					<button 
																						type="button"
																						class="dropdown-pin-btn" 
																						class:pinned={pinnedModelNames.includes(m.name)}
																						onclick={(e) => togglePin(m.name, e)}
																						title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																					>
																						★
																					</button>
																				</div>
																			{/each}
																		</div>
																	{:else}
																		<div class="dropdown-empty">ไม่พบโมเดล Cloud</div>
																	{/if}
																{:else if activeDropdownTab === 'gemini'}
																	{#if geminiDropdownModels.length > 0}
																		<!-- Pinned Gemini Section -->
																		{#if geminiDropdownModels.filter(m => pinnedModelNames.includes(m.name)).length > 0}
																			<div class="dropdown-group-header">ที่ปักหมุดไว้</div>
																			<div class="dropdown-model-grid" style="margin-bottom: 6px;">
																				{#each geminiDropdownModels.filter(m => pinnedModelNames.includes(m.name)) as m}
																					<div 
																						class="dropdown-model-card" 
																						class:selected={model === m.name}
																						onclick={() => {
																							updateModelStep(idx, m.name);
																							activeDropdownIdx = null;
																						}}
																					>
																						<div class="dropdown-card-content">
																							<div class="dropdown-name-row">
																								<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																								<span class="dropdown-source-badge gemini">G</span>
																							</div>
																						</div>
																						<button 
																							type="button"
																							class="dropdown-pin-btn pinned" 
																							onclick={(e) => togglePin(m.name, e)}
																							title="ถอนหมุดโมเดล"
																						>
																							★
																						</button>
																					</div>
																				{/each}
																			</div>
																			<div class="dropdown-group-header">โมเดลทั้งหมด</div>
																		{/if}

																		<div class="dropdown-model-grid">
																			{#each geminiDropdownModels as m}
																				<div 
																					class="dropdown-model-card" 
																					class:selected={model === m.name}
																					onclick={() => {
																						updateModelStep(idx, m.name);
																						activeDropdownIdx = null;
																					}}
																				>
																					<div class="dropdown-card-content">
																						<div class="dropdown-name-row">
																							<span class="dropdown-name-text" title={m.name}>{m.name}</span>
																							<span class="dropdown-source-badge gemini">G</span>
																						</div>
																					</div>
																					<button 
																						type="button"
																						class="dropdown-pin-btn" 
																						class:pinned={pinnedModelNames.includes(m.name)}
																						onclick={(e) => togglePin(m.name, e)}
																						title={pinnedModelNames.includes(m.name) ? "ถอนหมุดโมเดล" : "ปักหมุดโมเดล"}
																					>
																						★
																					</button>
																				</div>
																			{/each}
																		</div>
																	{:else}
																		<div class="dropdown-empty">ไม่พบโมเดล Gemini</div>
																	{/if}
																{/if}
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
							<div class="setting-item-block" style="margin-bottom: 8px; border-bottom: 1px solid var(--border-light); padding-bottom: 16px;">
								<label class="modal-checkbox-label" for="modal-customize-settings">
									<input 
										type="checkbox" 
										id="modal-customize-settings" 
										bind:checked={customizeSettings} 
									/>
									<span>Enable Manual Parameter Tuning (ปรับแต่งพารามิเตอร์โมเดลด้วยตัวเอง)</span>
								</label>
							</div>

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
		color: var(--bg-primary);
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
		align-items: center;
		justify-content: center;
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

	/* Toggle Switch CSS */
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

	/* Model Chain Configuration */
	.model-chain-intro h3 {
		margin: 0 0 4px 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.model-chain-intro p {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.4;
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

	.modal-checkbox-label input {
		width: 15px;
		height: 15px;
		cursor: pointer;
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

	.fallback-warning-text h4 {
		margin: 0 0 2px 0;
		font-size: 0.84rem;
		font-weight: 600;
	}

	.fallback-warning-text p {
		margin: 0;
		font-size: 0.76rem;
		color: var(--text-secondary);
		line-height: 1.4;
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
		color: var(--bg-primary);
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

	@media (max-width: 768px) {
		.settings-modal-content {
			flex-direction: column;
			height: 90vh;
			max-height: 90vh;
			width: 100%;
			max-width: calc(100vw - 32px);
			box-sizing: border-box;
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
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		cursor: pointer;
		transition: all var(--transition-fast);
		gap: 8px;
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
</style>
