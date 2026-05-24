<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ChatArea from '$lib/components/ChatArea.svelte';
	import InputArea from '$lib/components/InputArea.svelte';
	import { untrack } from 'svelte';
	
	import type { Conversation, Message, OllamaModel } from '$lib/types';
	import { fetchModels, streamChat, DEFAULT_OLLAMA_URL } from '$lib/ollama';

	// Reactive States
	let conversations = $state<Conversation[]>([]);
	let currentConversationId = $state<string | null>(null);
	let ollamaUrl = $state<string>(DEFAULT_OLLAMA_URL);
	let models = $state<OllamaModel[]>([]);
	let selectedModel = $state<string>('');
	let isConnected = $state<boolean>(false);
	let isGenerating = $state<boolean>(false);
	let input = $state<string>('');
	let drafts = $state<Record<string, string>>({});

	// Abort controller to cancel streaming
	let abortController: AbortController | null = null;

	// Computed: Active Conversation
	const currentConversation = $derived(
		conversations.find((c) => c.id === currentConversationId) || null
	);

	// Load data from localStorage on Mount
	$effect(() => {
		untrack(() => {
			const storedUrl = localStorage.getItem('ollama_url');
			if (storedUrl) ollamaUrl = storedUrl;

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

			const storedModel = localStorage.getItem('ollama_selected_model');
			if (storedModel) selectedModel = storedModel;

			const storedDrafts = localStorage.getItem('ollama_drafts');
			if (storedDrafts) {
				try {
					drafts = JSON.parse(storedDrafts);
				} catch (e) {
					console.error('Failed to parse drafts from localStorage:', e);
				}
			}
			
			// Load initial draft for current conversation
			const activeKey = currentConversationId || 'new-chat';
			if (drafts[activeKey]) {
				input = drafts[activeKey];
			}
		});
	});

	// Save data to localStorage on state changes
	$effect(() => {
		localStorage.setItem('ollama_url', ollamaUrl);
	});

	$effect(() => {
		localStorage.setItem('ollama_conversations', JSON.stringify(conversations));
	});

	$effect(() => {
		if (currentConversationId) {
			localStorage.setItem('ollama_active_id', currentConversationId);
		} else {
			localStorage.removeItem('ollama_active_id');
		}
	});

	$effect(() => {
		if (selectedModel) {
			localStorage.setItem('ollama_selected_model', selectedModel);
		}
	});

	// Save drafts to localStorage
	$effect(() => {
		localStorage.setItem('ollama_drafts', JSON.stringify(drafts));
	});

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

	// Trigger model loading whenever URL changes
	$effect(() => {
		if (ollamaUrl) {
			untrack(() => {
				loadModels();
			});
		}
	});

	// Fetch models from Ollama
	async function loadModels() {
		try {
			const fetchedModels = await fetchModels(ollamaUrl);
			models = fetchedModels;
			isConnected = true;

			// Auto select first model if none selected or the current selected one is gone
			if (fetchedModels.length > 0) {
				const modelNames = fetchedModels.map((m) => m.name);
				if (!selectedModel || !modelNames.includes(selectedModel)) {
					selectedModel = fetchedModels[0].name;
				}
			} else {
				selectedModel = '';
			}
		} catch (error) {
			console.error('Ollama connection failed:', error);
			models = [];
			selectedModel = '';
			isConnected = false;
		}
	}

	// Create a new conversation
	function handleNewConversation() {
		// If there is already an empty conversation, just select it instead of creating a duplicate
		const emptyConv = conversations.find(c => c.messages.length === 0);
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
	}

	// Stop assistant generation
	function handleStopGeneration() {
		if (abortController) {
			abortController.abort();
			isGenerating = false;
		}
	}

	// Send message to assistant
	async function handleSendPrompt(promptText: string = input) {
		const cleanPrompt = promptText.trim();
		if (!cleanPrompt || !selectedModel) return;

		// 1. Ensure there is an active conversation, create one if not
		let activeConvId = currentConversationId;
		if (!activeConvId) {
			const newConv: Conversation = {
				id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				title: cleanPrompt.slice(0, 30) + (cleanPrompt.length > 30 ? '...' : ''),
				messages: [],
				createdAt: Date.now(),
				model: selectedModel
			};
			conversations = [newConv, ...conversations];
			activeConvId = newConv.id;
			currentConversationId = activeConvId;
		}

		const userMessage: Message = {
			id: `msg-${Date.now()}-user`,
			role: 'user',
			content: cleanPrompt,
			timestamp: Date.now()
		};

		// 2. Add user message to conversation
		conversations = conversations.map((conv) => {
			if (conv.id === activeConvId) {
				// If default title, update title based on first prompt
				const title = conv.title === 'New Conversation' 
					? cleanPrompt.slice(0, 30) + (cleanPrompt.length > 30 ? '...' : '')
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
		await streamChat(
			{
				messages: currentConversation?.messages.slice(0, -1) || [], // send messages excluding the empty assistant placeholder
				model: selectedModel,
				ollamaUrl
			},
			// onChunk callback
			(chunk) => {
				conversations = conversations.map((conv) => {
					if (conv.id === activeConvId) {
						return {
							...conv,
							messages: conv.messages.map((m) => {
								if (m.id === assistantMsgId) {
									return { ...m, content: m.content + chunk };
								}
								return m;
							})
						};
					}
					return conv;
				});
			},
			// onDone callback
			() => {
				isGenerating = false;
				abortController = null;
			},
			// onError callback
			(error) => {
				conversations = conversations.map((conv) => {
					if (conv.id === activeConvId) {
						return {
							...conv,
							messages: conv.messages.map((m) => {
								if (m.id === assistantMsgId) {
									return {
										...m,
										content: m.content + `\n\n**Error:** _${error.message}_`
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
			},
			abortController.signal
		);
	}

	// Resubmit prompt from a specific state (without appending a duplicate user message)
	async function handleResubmit(activeConvId: string) {
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
		await streamChat(
			{
				messages: conv?.messages.slice(0, -1) || [], // send all messages excluding the assistant placeholder
				model: selectedModel,
				ollamaUrl
			},
			// onChunk callback
			(chunk) => {
				conversations = conversations.map((c) => {
					if (c.id === activeConvId) {
						return {
							...c,
							messages: c.messages.map((m) => {
								if (m.id === assistantMsgId) {
									return { ...m, content: m.content + chunk };
								}
								return m;
							})
						};
					}
					return c;
				});
			},
			// onDone callback
			() => {
				isGenerating = false;
				abortController = null;
			},
			// onError callback
			(error) => {
				conversations = conversations.map((c) => {
					if (c.id === activeConvId) {
						return {
							...c,
							messages: c.messages.map((m) => {
								if (m.id === assistantMsgId) {
									return {
										...m,
										content: m.content + `\n\n**Error:** _${error.message}_`
									};
								}
								return m;
							})
						};
					}
					return c;
				});
				isGenerating = false;
				abortController = null;
			},
			abortController.signal
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
</script>

<div class="app-layout">
	<!-- Sidebar -->
	<Sidebar 
		{conversations}
		{currentConversationId}
		bind:ollamaUrl
		{isConnected}
		{models}
		onSelectConversation={handleSelectConversation}
		onNewConversation={handleNewConversation}
		onDeleteConversation={handleDeleteConversation}
		onUpdateTitle={handleUpdateTitle}
		onRefreshModels={loadModels}
	/>

	<!-- Main Chat Area -->
	<main class="main-content">
		<ChatArea 
			conversation={currentConversation}
			{isGenerating}
			onSendPrompt={handleSendPrompt}
			onEditPrompt={handleEditPrompt}
			onStopGeneration={handleStopGeneration}
		/>

		<!-- Input Area at the bottom -->
		<InputArea 
			bind:input
			{models}
			bind:selectedModel
			{isGenerating}
			onSend={() => handleSendPrompt()}
			onStop={handleStopGeneration}
		/>
	</main>
</div>

<style>
	.app-layout {
		display: flex;
		width: 100vw;
		height: 100vh;
		background-color: var(--bg-primary);
		overflow: hidden;
		position: relative;
	}

	.main-content {
		flex: 1;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	@media (max-width: 768px) {
		.app-layout {
			flex-direction: column;
		}
	}
</style>
