<script lang="ts">
	import type { Conversation, Message, Attachment, Project, OllamaModel } from '$lib/types';
	import { renderMarkdown, parseThinking } from '$lib/markdown';
	import { tick, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { db } from '$lib/db';
	import { roleStore } from '$lib/roleStore.svelte';

	let {
		conversation = null,
		isGenerating = false,
		isBusy = false,
		isInitialized = false,
		showContextPanel = false,
		showSidebar = true,
		theme = 'dark-blue',
		projects = [],
		conversations = [],
		models = [],
		fontSize = $bindable(15),
		fontFamily = $bindable('inter'),
		rightPaneTab = 'context',
		onSendPrompt,
		onEditPrompt,
		onStopGeneration,
		onToggleContextPanel,
		onOpenThinking,
		onOpenCanvasFile,
		onToggleSidebar,
		onToggleTheme,
		onSelectColor,
		onSelectConversation,
		onToggleMessageFeedback,
		onResendPrompt
	} = $props<{
		conversation: Conversation | null;
		isGenerating: boolean;
		isBusy?: boolean;
		isInitialized: boolean;
		showContextPanel: boolean;
		showSidebar: boolean;
		theme: string;
		projects?: Project[];
		conversations?: Conversation[];
		models?: (OllamaModel & { source?: 'local' | 'cloud' | 'gemini' })[];
		fontSize?: number;
		fontFamily?: string;
		rightPaneTab?: 'context' | 'thinking' | 'canvas';
		onSendPrompt: (prompt: string) => void;
		onEditPrompt: (messageId: string, newContent: string) => void;
		onStopGeneration: () => void;
		onToggleContextPanel: () => void;
		onOpenThinking: (messageId: string) => void;
		onOpenCanvasFile?: (name: string) => void;
		onToggleSidebar: () => void;
		onToggleTheme: () => void;
		onSelectColor: (color: string) => void;
		onSelectConversation?: (id: string) => void;
		onToggleMessageFeedback?: (messageId: string, feedback: 'up' | 'down') => void;
		onResendPrompt?: (messageId: string) => void;
	}>();

	let chatContainer = $state<HTMLDivElement | null>(null);
	let lastConversationId = $state<string | null>(null);
	let wasAtBottomBeforeUpdate = true;
	let lastScrollHeight = 0;
	let editingMessageId = $state<string | null>(null);
	let editingMessageContent = $state('');
	let copiedMessageId = $state<string | null>(null);

	function handleCopyMessage(msg: Message) {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(msg.content);
			copiedMessageId = msg.id;
			setTimeout(() => {
				if (copiedMessageId === msg.id) {
					copiedMessageId = null;
				}
			}, 2000);
		}
	}

	function getModelGroup(modelName: string | undefined): 'local' | 'cloud' | 'gemini' {
		if (!modelName) return 'local';
		
		const parts = modelName.split(' ➔ ');
		const lastName = (parts[parts.length - 1] || '').trim();
		const name = lastName.toLowerCase();
		
		if (name.startsWith('gemini-') || name.includes('gemini')) {
			return 'gemini';
		}
		
		if (models && models.length > 0) {
			const found = models.find((m: any) => m.name.toLowerCase() === name);
			if (found && found.source) {
				return found.source;
			}
		}
		
		return 'local';
	}

	let openedThoughts = $state<Record<string, boolean>>({});

	// Auto-open thought process for a message when it starts actively thinking
	$effect(() => {
		if (isGenerating && conversation && conversation.messages.length > 0) {
			const lastMsg = conversation.messages[conversation.messages.length - 1];
			if (lastMsg.role === 'assistant') {
				const parsed = parseThinking(lastMsg.content);
				if (parsed.isThinking && openedThoughts[lastMsg.id] === undefined) {
					if (showContextPanel && rightPaneTab === 'thinking') {
						openedThoughts[lastMsg.id] = false;
					} else {
						openedThoughts[lastMsg.id] = true;
					}
				}
			}
		}
	});

	let isExportMenuOpen = $state(false);
	let isAppearanceOpen = $state(false);

	let lightboxImage = $state<string | null>(null);
	let lightboxAlt = $state('');

	if (typeof window !== 'undefined') {
		(window as any).showMediaLightbox = (src: string, altEscaped: string) => {
			lightboxImage = src;
			lightboxAlt = decodeURIComponent(altEscaped || '');
		};
	}

	function closeLightbox() {
		lightboxImage = null;
		lightboxAlt = '';
	}

	// Close lightbox on Escape key
	$effect(() => {
		if (lightboxImage) {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					closeLightbox();
				}
			};
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	});

	// Mermaid states
	let mermaidLib = $state<any>(null);
	let lightboxMermaidCode = $state<string | null>(null);
	let lightboxMermaidScale = $state(1);
	let lightboxMermaidOffset = $state({ x: 0, y: 0 });
	let lightboxMermaidIsDragging = $state(false);
	let lightboxMermaidDragStart = $state({ x: 0, y: 0 });
	let lightboxMermaidContainer = $state<HTMLDivElement | null>(null);

	// Raw message diagnostic view state
	let rawDiagnosticMsg = $state<Message | null>(null);
	let rawDiagnosticCopied = $state(false);
	function closeRawDiagnostic() {
		rawDiagnosticMsg = null;
		rawDiagnosticCopied = false;
	}
	function handleCopyRawDiagnostic() {
		if (!rawDiagnosticMsg) return;
		navigator.clipboard.writeText(rawDiagnosticMsg.content || '');
		rawDiagnosticCopied = true;
		setTimeout(() => {
			rawDiagnosticCopied = false;
		}, 2000);
	}
	$effect(() => {
		if (rawDiagnosticMsg) {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					closeRawDiagnostic();
				}
			};
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	});

	// Dynamically load Mermaid on client-side and re-initialize when theme changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			const initMermaid = (m: any) => {
				m.initialize({
					startOnLoad: false,
					theme: theme === 'dark' ? 'base' : 'neutral',
					securityLevel: 'loose',
					fontFamily: 'var(--font-main)',
					themeVariables: theme === 'dark' ? {
						background: '#1a1a1b',
						primaryColor: '#c2d9ff', // Soft light blue for node background
						primaryTextColor: '#111827', // Dark gray for node text
						primaryBorderColor: '#4b5563', // Grey node border
						lineColor: '#8e918f', // Grey arrow line color
						secondaryColor: '#e5e7eb',
						tertiaryColor: '#f3f4f6',
						labelTextColor: '#c4c7c5', // Light text for edge labels
						edgeLabelBackground: '#1a1a1b' // Dark background for edge labels to hide lines behind
					} : {
						background: '#faf8f5',
						primaryColor: '#e2ddd2', // Soft warm sand for node background
						primaryTextColor: '#2b2620', // Warm dark charcoal for node text
						primaryBorderColor: '#dcd6ca', // Warm border
						lineColor: '#857e75', // Warm grey arrow line color
						secondaryColor: '#f5f2eb',
						tertiaryColor: '#ffffff',
						labelTextColor: '#57514a', // Warm secondary text for edge labels
						edgeLabelBackground: '#faf8f5' // Warm code bg for edge labels
					}
				});
				renderAllMermaid(true);
			};

			if (!mermaidLib) {
				import('mermaid').then((m) => {
					mermaidLib = m.default;
					initMermaid(mermaidLib);
				}).catch((err) => {
					console.error('Failed to load mermaid:', err);
				});
			} else {
				// Re-initialize when theme changes
				initMermaid(mermaidLib);
			}
		}
	});

	// Re-render mermaid whenever conversation changes or generation ends
	$effect(() => {
		if (conversation && conversation.messages && mermaidLib) {
			// Watch isGenerating to re-trigger rendering once generation completes
			const _ = isGenerating;
			tick().then(() => {
				renderAllMermaid();
			});
		}
	});

	function sanitizeMermaidCode(code: string): string {
		if (!code) return '';
		
		const lines = code.split('\n');
		const specialCharRegex = /[()/\&:+%,-]/;
		
		const sanitizedLines = lines.map(line => {
			let trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('%%')) {
				return line;
			}
			
			// 1. Stadium shape: ID([text])
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\(\s*\[([^"\]]+)\]\s*\)/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}(["${escapedText}"])`;
				}
				return match;
			});

			// 2. Subroutine shape: ID[[text]]
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\[\s*\[([^"\]]+)\]\s*\]/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}[["${escapedText}"]]`;
				}
				return match;
			});

			// 3. Cylinder shape: ID[(text)]
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\[\s*\(([^")]+)\)\s*\]/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}[("${escapedText}")]`;
				}
				return match;
			});

			// 4. Circle shape: ID((text))
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\(\s*\(([^")]+)\)\s*\)/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}(("${escapedText}"))`;
				}
				return match;
			});

			// 5. Hexagon shape: ID{{text}}
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\{\s*\{([^"}]+)\}\s*\}/g, (match, id, text) => {
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}{{"${escapedText}"}}`;
				}
				return match;
			});

			// 6. Rhombus/Decision shape: ID{text}
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\{\s*([^"}]+)\s*\}/g, (match, id, text) => {
				if (text.startsWith('{') || text.endsWith('}')) return match;
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}{"${escapedText}"}`;
				}
				return match;
			});

			// 7. Round shape: ID(text)
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\(\s*([^")]+)\s*\)/g, (match, id, text) => {
				if (text.startsWith('(') || text.endsWith(')')) return match;
				if (id === 'graph' || id === 'flowchart') return match;
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}("${escapedText}")`;
				}
				return match;
			});

			// 8. Square shape: ID[text]
			line = line.replace(/(\b[a-zA-Z0-9_-]+)\[\s*([^"\]]+)\s*\]/g, (match, id, text) => {
				if (text.startsWith('[') || text.endsWith(']')) return match;
				if (specialCharRegex.test(text)) {
					const escapedText = text.replace(/"/g, '\\"');
					return `${id}["${escapedText}"]`;
				}
				return match;
			});

			return line;
		});
		
		return sanitizedLines.join('\n');
	}

	async function renderAllMermaid(force: boolean = false) {
		if (!mermaidLib) return;
		
		const containers = document.querySelectorAll('.mermaid-preview-container');
		for (const container of containers) {
			const id = container.id.replace('container-', '');
			const template = document.getElementById(id) as HTMLTemplateElement;
			if (!template) continue;
			
			const rawCode = decodeURIComponent(template.innerHTML).trim();
			const code = sanitizeMermaidCode(rawCode);
			const lastCode = container.getAttribute('data-last-code');
			
			// Avoid re-rendering if code is exactly the same and already processed, unless forced (e.g. theme changed)
			if (!force && lastCode === code && container.getAttribute('data-processed') === 'true') {
				continue;
			}
			
			if (force) {
				container.removeAttribute('data-processed');
				container.removeAttribute('data-last-code');
			}
			
			container.setAttribute('data-last-code', code);
			
			try {
				// Parse to validate syntax
				await mermaidLib.parse(code);
				
				// Generate a completely unique element ID for mermaid.render to avoid collisions
				const renderId = `svg-${id}-${Math.random().toString(36).slice(2, 7)}`;
				
				// Render diagram
				const { svg } = await mermaidLib.render(renderId, code);
				container.innerHTML = svg;
				container.setAttribute('data-processed', 'true');
				container.classList.remove('has-error');
			} catch (err: any) {
				// If not generating, show error block. If generating, keep loading/partial preview
				if (!isGenerating) {
					console.error('Mermaid render error:', err);
					container.innerHTML = `
						<div class="mermaid-error">
							<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 8px; display: inline-block;">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v2z"/>
							</svg>
							<span>Error rendering flowchart: ${err.message || 'Syntax error'}</span>
						</div>
					`;
					container.classList.add('has-error');
					container.setAttribute('data-processed', 'true');
				} else {
					if (!container.innerHTML || container.innerHTML.includes('mermaid-error')) {
						container.innerHTML = `
							<div class="mermaid-loading">
								<div class="spinner-glow small"></div>
								<span>Generating flowchart...</span>
							</div>
						`;
					}
				}
			}
		}
	}

	// Register global handlers for tab switching & fullscreen zoom
	if (typeof window !== 'undefined') {
		(window as any).zoomMermaid = (id: string) => {
			const template = document.getElementById(id) as HTMLTemplateElement;
			if (!template) return;
			const code = decodeURIComponent(template.innerHTML);
			lightboxMermaidCode = code;
			lightboxMermaidScale = 1;
			lightboxMermaidOffset = { x: 0, y: 0 };
		};

		(window as any).switchMermaidTab = (id: string, tab: 'preview' | 'code') => {
			const wrapper = document.getElementById(`wrapper-${id}`);
			if (!wrapper) return;
			
			const previewContainer = document.getElementById(`container-${id}`);
			const codeContainer = document.getElementById(`code-container-${id}`);
			const zoomBtn = document.getElementById(`zoom-btn-${id}`);
			const tabs = wrapper.querySelectorAll('.mermaid-tab');
			
			if (tab === 'preview') {
				previewContainer?.classList.remove('hidden');
				codeContainer?.classList.add('hidden');
				zoomBtn?.classList.remove('hidden');
				tabs[0]?.classList.add('active');
				tabs[1]?.classList.remove('active');
			} else {
				previewContainer?.classList.add('hidden');
				codeContainer?.classList.remove('hidden');
				zoomBtn?.classList.add('hidden');
				tabs[0]?.classList.remove('active');
				tabs[1]?.classList.add('active');
			}
		};
	}

	function closeMermaidLightbox() {
		lightboxMermaidCode = null;
	}

	function zoomIn(e: MouseEvent) {
		e.stopPropagation();
		lightboxMermaidScale = Math.min(lightboxMermaidScale + 0.15, 3);
	}

	function zoomOut(e: MouseEvent) {
		e.stopPropagation();
		lightboxMermaidScale = Math.max(lightboxMermaidScale - 0.15, 0.3);
	}

	function zoomReset(e: MouseEvent) {
		e.stopPropagation();
		lightboxMermaidScale = 1;
		lightboxMermaidOffset = { x: 0, y: 0 };
	}

	function startDrag(e: MouseEvent) {
		if (e.button !== 0) return; // Only left click
		lightboxMermaidIsDragging = true;
		lightboxMermaidDragStart = {
			x: e.clientX - lightboxMermaidOffset.x,
			y: e.clientY - lightboxMermaidOffset.y
		};
	}

	function drag(e: MouseEvent) {
		if (!lightboxMermaidIsDragging) return;
		lightboxMermaidOffset = {
			x: e.clientX - lightboxMermaidDragStart.x,
			y: e.clientY - lightboxMermaidDragStart.y
		};
	}

	function endDrag() {
		lightboxMermaidIsDragging = false;
	}

	// Close mermaid lightbox on Escape key
	$effect(() => {
		if (lightboxMermaidCode) {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					closeMermaidLightbox();
				}
			};
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	});

	// Handle wheel zoom inside viewport without passive listeners warning
	$effect(() => {
		if (lightboxMermaidCode && typeof window !== 'undefined') {
			const viewport = document.querySelector('.lightbox-mermaid-viewport');
			if (viewport) {
				const preventDefaultWheel = (e: WheelEvent) => {
					e.preventDefault();
					const zoomFactor = 0.08;
					const direction = e.deltaY < 0 ? 1 : -1;
					const newScale = lightboxMermaidScale + direction * zoomFactor;
					lightboxMermaidScale = Math.max(0.3, Math.min(newScale, 4));
				};
				viewport.addEventListener('wheel', preventDefaultWheel as any, { passive: false });
				return () => {
					viewport.removeEventListener('wheel', preventDefaultWheel as any);
				};
			}
		}
	});

	// Watch for lightbox opening to render the Mermaid SVG into it
	$effect(() => {
		if (lightboxMermaidCode && lightboxMermaidContainer && mermaidLib) {
			const code = sanitizeMermaidCode(lightboxMermaidCode);
			const container = lightboxMermaidContainer;
			const renderId = `lightbox-svg-${Math.random().toString(36).slice(2, 7)}`;
			
			mermaidLib.render(renderId, code).then(({ svg }: { svg: string }) => {
				if (container) {
					container.innerHTML = svg;
				}
			}).catch((err: any) => {
				console.error('Lightbox Mermaid render error:', err);
				if (container) {
					container.innerHTML = `
						<div class="mermaid-error">
							<span>Error rendering flowchart: ${err.message || 'Syntax error'}</span>
						</div>
					`;
				}
			});
		}
	});

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

	// Close appearance dropdown when clicking outside
	$effect(() => {
		if (isAppearanceOpen) {
			const handleOutsideClick = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (!target.closest('.appearance-controls')) {
					isAppearanceOpen = false;
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

	function handleEditKeydown(e: KeyboardEvent, msgId: string) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (editingMessageContent.trim() && !isGenerating && !isBusy) {
				saveEditPrompt(msgId);
			}
		}
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

	const fontFamilies = ['inter', 'outfit', 'lora', 'fira-code', 'system'];

	function toggleFontFamily() {
		const currentIndex = fontFamilies.indexOf(fontFamily);
		const nextIndex = (currentIndex + 1) % fontFamilies.length;
		fontFamily = fontFamilies[nextIndex];
		localStorage.setItem('chat_font_family', fontFamily);
	}

	function getFontName(fontId: string) {
		switch (fontId) {
			case 'inter': return 'Inter (Sans)';
			case 'outfit': return 'Outfit (Rounded)';
			case 'lora': return 'Lora (Serif)';
			case 'fira-code': return 'Fira Code (Mono)';
			case 'system': return 'System UI';
			default: return 'Inter';
		}
	}

	// Determine if the current new chat belongs to a project
	const currentProject = $derived(
		conversation && conversation.projectId
			? projects.find((p: Project) => p.id === conversation.projectId) || null
			: null
	);

	const themeColors = [
		{ name: 'blue', label: 'Blue (ฟ้า)', color: '#3b82f6' },
		{ name: 'indigo', label: 'Indigo (น้ำเงินคราม)', color: '#6366f1' },
		{ name: 'purple', label: 'Purple (ม่วง)', color: '#a855f7' },
		{ name: 'pink', label: 'Pink (ชมพู)', color: '#ec4899' },
		{ name: 'red', label: 'Red (แดง)', color: '#ef4444' },
		{ name: 'orange', label: 'Orange (ส้ม)', color: '#f97316' },
		{ name: 'yellow', label: 'Yellow (เหลือง)', color: '#eab308' },
		{ name: 'green', label: 'Green (เขียว)', color: '#22c55e' },
		{ name: 'teal', label: 'Teal (เทอร์ควอยซ์)', color: '#14b8a6' },
		{ name: 'cyan', label: 'Cyan (ฟ้าคราม)', color: '#06b6d4' },
		{ name: 'gray', label: 'Gray (เทา)', color: '#6b7280' }
	];

	const activeColor = $derived(themeColors.find(c => theme.endsWith(c.name)) || themeColors[0]);

	// Get latest conversations for the display
	const recentChats = $derived.by(() => {
		// Filter out the current empty/new conversation
		const otherConvs = conversations.filter((c: Conversation) => c.id !== conversation?.id);
		
		if (currentProject) {
			// Inside a project: show only conversations belonging to this project
			return otherConvs
				.filter((c: Conversation) => c.projectId === currentProject.id && c.messages.length > 0)
				.sort((a: Conversation, b: Conversation) => {
					const timeA = a.messages[a.messages.length - 1]?.timestamp || a.createdAt;
					const timeB = b.messages[b.messages.length - 1]?.timestamp || b.createdAt;
					return timeB - timeA;
				})
				.slice(0, 4);
		} else {
			// General/Independent chat: show all latest conversations overall
			return otherConvs
				.filter((c: Conversation) => c.messages.length > 0)
				.sort((a: Conversation, b: Conversation) => {
					const timeA = a.messages[a.messages.length - 1]?.timestamp || a.createdAt;
					const timeB = b.messages[b.messages.length - 1]?.timestamp || b.createdAt;
					return timeB - timeA;
				})
				.slice(0, 4);
		}
	});

	function formatRelativeTime(timestamp: number): string {
		if (!timestamp) return '';
		const diffMs = Date.now() - timestamp;
		if (diffMs < 0) return 'now';
		
		const diffMins = Math.floor(diffMs / 60000);
		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m ago`;
		
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	function formatDateTime(timestamp: number, showSeconds = false): string {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const now = new Date();
		
		const isToday = date.toDateString() === now.toDateString();
		
		const yesterday = new Date();
		yesterday.setDate(now.getDate() - 1);
		const isYesterday = date.toDateString() === yesterday.toDateString();
		
		const timeStr = date.toLocaleTimeString([], { 
			hour: '2-digit', 
			minute: '2-digit',
			...(showSeconds ? { second: '2-digit' } : {})
		});
		
		if (isToday) {
			return `วันนี้, ${timeStr}`;
		} else if (isYesterday) {
			return `เมื่อวาน, ${timeStr}`;
		} else {
			const dateStr = date.toLocaleDateString([], {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			});
			return `${dateStr} ${timeStr}`;
		}
	}

	function getChatLastMessageSnippet(conv: Conversation): string {
		if (!conv.messages || conv.messages.length === 0) return '';
		// Find the last user message or last assistant message to show snippet
		// Iterate backwards to find the last message with content
		for (let i = conv.messages.length - 1; i >= 0; i--) {
			const msg = conv.messages[i];
			if (msg.content) {
				const cleaned = msg.content.replace(/<[^>]*>/g, '').replace(/<\/?think>[\s\S]*?(<\/think>|$)/gi, '').trim();
				if (cleaned) {
					return cleaned.slice(0, 75) + (cleaned.length > 75 ? '...' : '');
				}
			}
		}
		return '';
	}



	// Smart scroll controller: pre-DOM-update measurement
	$effect.pre(() => {
		if (!conversation || !conversation.messages) return;
		const msgLength = conversation.messages.length;
		const lastMsg = conversation.messages[msgLength - 1];
		const lastMsgContent = lastMsg?.content || '';

		if (chatContainer) {
			const { scrollTop, clientHeight } = chatContainer;
			wasAtBottomBeforeUpdate = lastScrollHeight === 0 || (lastScrollHeight - scrollTop - clientHeight < 80);
		}
	});

	// Smart scroll controller: post-DOM-update action
	$effect(() => {
		if (!conversation || !conversation.messages) return;
		
		const currentId = conversation.id;
		const msgLength = conversation.messages.length;
		const lastMsg = conversation.messages[msgLength - 1];
		const lastMsgContent = lastMsg?.content || '';

		untrack(() => {
			// 1. Conversation switch
			if (currentId !== lastConversationId) {
				lastConversationId = currentId;
				wasAtBottomBeforeUpdate = true;
				openedThoughts = {}; // reset open thoughts record
				scrollToBottom('auto');
				return;
			}

			if (msgLength === 0) return;

			// 2. Active AI generation (streaming response)
			if (isGenerating && lastMsg && lastMsg.role === 'assistant') {
				if (wasAtBottomBeforeUpdate) {
					scrollToBottom('auto');
				} else if (chatContainer) {
					lastScrollHeight = chatContainer.scrollHeight;
				}
				return;
			}

			// 3. User message sent
			if (lastMsg && lastMsg.role === 'user') {
				wasAtBottomBeforeUpdate = true;
				scrollToBottom('smooth');
			}
		});
	});

	function handleScroll() {
		if (!chatContainer) return;
		
		const { scrollTop, scrollHeight, clientHeight } = chatContainer;
		lastScrollHeight = scrollHeight;
		wasAtBottomBeforeUpdate = scrollHeight - scrollTop - clientHeight < 80;
	}

	async function scrollToBottom(behavior: 'auto' | 'smooth' = 'smooth') {
		await tick();
		if (chatContainer) {
			chatContainer.scrollTo({
				top: chatContainer.scrollHeight,
				behavior
			});
			lastScrollHeight = chatContainer.scrollHeight;
		}
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

	function handleViewportClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const card = target.closest('.canvas-artifact-card');
		if (card) {
			const fileName = card.getAttribute('data-file-name');
			if (fileName && onOpenCanvasFile) {
				onOpenCanvasFile(fileName);
			}
		}
	}

	// AI Memories / Remember message
	let messageSavedIndicator = $state<string | null>(null);
	async function handleRememberMessage(msg: Message) {
		if (!msg.content || !conversation) return;
		
		const parsed = parseThinking(msg.content);
		const cleanText = (parsed.response || msg.content).trim();
		if (!cleanText) return;
		
		try {
			await db.aiMemories.add({
				chatId: conversation.id,
				projectId: conversation.projectId || undefined,
				content: cleanText,
				createdAt: Date.now()
			});
			messageSavedIndicator = msg.id;
			setTimeout(() => {
				if (messageSavedIndicator === msg.id) {
					messageSavedIndicator = null;
				}
			}, 2000);
		} catch (e) {
			console.error('Failed to save to memory:', e);
		}
	}
</script>

<div class="chat-area">
	<!-- Sticky Header Bar -->
	<header class="chat-header">
		<div class="chat-title-group">
			<button 
				class="sidebar-toggle-btn" 
				onclick={onToggleSidebar}
				title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
				aria-label={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
			>
				<svg viewBox="0 0 24 24" width="20" height="20">
					{#if showSidebar}
						<!-- Sidebar Shown Icon -->
						<path fill="currentColor" d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 4v10h4V8H4zm6 0v10h10V8H10z"/>
					{:else}
						<!-- Sidebar Hidden Icon -->
						<path fill="currentColor" d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 4v10h16V8H4z"/>
					{/if}
				</svg>
			</button>
			<div class="chat-title">
				{#if conversation}
					{conversation.title}
				{:else}
					New Conversation
				{/if}
			</div>
		</div>

		<div class="header-actions">
			<!-- Unified Appearance Dropdown triggered by the Theme Icon -->
			<div class="appearance-controls">
				<button 
					class="theme-toggle-btn"
					onclick={() => isAppearanceOpen = !isAppearanceOpen}
					aria-expanded={isAppearanceOpen}
					title="เปลี่ยนตัวอักษร ซูม และสีธีม"
					style="--active-theme-color: {activeColor.color}"
				>
					{#if theme.startsWith('dark')}
						<!-- Sun Icon -->
						<svg viewBox="0 0 24 24" width="18" height="18">
							<path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41zm-12.37 12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41z"/>
						</svg>
					{:else}
						<!-- Moon Icon -->
						<svg viewBox="0 0 24 24" width="18" height="18">
							<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
						</svg>
					{/if}
				</button>
 
 				{#if isAppearanceOpen}
 					<div class="appearance-dropdown animate-zoom-in">
						<!-- Section 1: Theme Mode (Light / Dark) -->
						<div class="dropdown-section">
							<div class="section-label">Theme Mode</div>
							<div class="theme-mode-row">
								<button 
									class="theme-mode-btn" 
									class:active={!theme.startsWith('dark')} 
									onclick={() => {
										if (theme.startsWith('dark')) {
											onToggleTheme();
										}
									}}
								>
									<!-- Sun Icon -->
									<svg viewBox="0 0 24 24" width="14" height="14">
										<path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41zm-12.37 12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41z"/>
									</svg>
									<span>Light</span>
								</button>
								<button 
									class="theme-mode-btn" 
									class:active={theme.startsWith('dark')} 
									onclick={() => {
										if (!theme.startsWith('dark')) {
											onToggleTheme();
										}
									}}
								>
									<!-- Moon Icon -->
									<svg viewBox="0 0 24 24" width="14" height="14">
										<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
									</svg>
									<span>Dark</span>
								</button>
							</div>
						</div>

 						<!-- Section 2: Font Family -->
 						<div class="dropdown-section">
 							<div class="section-label">Font Family</div>
 							<div class="font-family-select-wrapper">
 								<select 
 									class="appearance-select" 
 									bind:value={fontFamily}
 									onchange={() => localStorage.setItem('chat_font_family', fontFamily)}
 								>
 									{#each fontFamilies as font}
 										<option value={font}>{getFontName(font)}</option>
 									{/each}
 								</select>
 								<svg class="chevron-select" viewBox="0 0 24 24" width="14" height="14">
 									<path fill="currentColor" d="M7 10l5 5 5-5z"/>
 								</svg>
 							</div>
 						</div>
 
 						<!-- Section 3: Zoom / Font Size -->
 						<div class="dropdown-section">
 							<div class="section-label">Text Zoom</div>
 							<div class="zoom-controls-row">
 								<button 
 									class="zoom-btn" 
 									onclick={decreaseFont} 
 									disabled={fontSize <= 10}
 									title="Decrease font size"
 								>
 									A-
 								</button>
 								<button 
 									class="zoom-reset-btn" 
 									onclick={() => {
 										fontSize = 15;
 										localStorage.setItem('chat_font_size', '15');
 									}}
 									title="Reset to 100%"
 								>
 									{Math.round((fontSize / 15) * 100)}%
 								</button>
 								<button 
 									class="zoom-btn" 
 									onclick={increaseFont} 
 									disabled={fontSize >= 30}
 									title="Increase font size"
 								>
 									A+
 								</button>
 							</div>
 						</div>
 
 						<!-- Section 4: Accent Color Theme -->
 						<div class="dropdown-section last">
 							<div class="section-label">Theme Color</div>
 							<div class="theme-color-grid">
 								{#each themeColors as col}
 									<button
 										class="color-dot-item {col.name}"
 										class:active={theme.endsWith(col.name)}
 										onclick={() => onSelectColor(col.name)}
 										title="Switch to {col.label} theme"
 										aria-label="Switch to {col.label} theme"
 										style="background-color: {col.color}"
 									></button>
 								{/each}
 							</div>
 						</div>
 					</div>
 				{/if}
 			</div>

			<!-- Export Button -->
			{#if conversation && conversation.messages.length > 0}
				<div class="export-controls">
					<button 
						class="export-btn" 
						onclick={() => isExportMenuOpen = !isExportMenuOpen}
						aria-expanded={isExportMenuOpen}
						title="Export Chat"
					>
						<svg viewBox="0 0 24 24" width="18" height="18">
							<path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
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

			<!-- Toggle Context / Canvas panel -->
			{#if conversation}
				<button 
					class="context-toggle-btn-header" 
					class:active-panel={showContextPanel}
					onclick={onToggleContextPanel}
					title={showContextPanel ? "Hide Right Panel" : "Show Right Panel"}
					aria-label={showContextPanel ? "Hide Right Panel" : "Show Right Panel"}
				>
					<svg viewBox="0 0 24 24" width="18" height="18">
						{#if showContextPanel}
							<!-- Right Sidebar Shown Icon (Splitted Layout box) -->
							<path fill="currentColor" d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H5V6h9v12zm5 0h-3V6h3v12z"/>
						{:else}
							<!-- Right Sidebar Hidden Icon (Empty Layout box) -->
							<path fill="currentColor" d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12z"/>
						{/if}
					</svg>
				</button>
			{/if}
		</div>
	</header>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div 
		class="chat-viewport" 
		bind:this={chatContainer} 
		onscroll={handleScroll}
		onclick={handleViewportClick}
	>
		{#if !isInitialized}
			<div class="chat-loading-placeholder">
				<div class="spinner-glow"></div>
			</div>
		{:else if !conversation || conversation.messages.length === 0}
			<!-- Dynamic Welcome Screen -->
			<div class="welcome-container animate-fade-in">
				<div class="welcome-header">
					{#if currentProject}
						<div class="project-indicator-badge">
							<svg viewBox="0 0 24 24" width="18" height="18" class="project-folder-icon">
								<path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
							</svg>
							<span>PROJECT WORKSPACE</span>
						</div>
						<h1 class="project-welcome-title">{currentProject.name}</h1>
						<h2 class="subtitle-text">Chat with AI powered by Svelte 5 and local Ollama models.</h2>
					{:else}
						<h1 class="gradient-text">Hello, Developer</h1>
						<h2 class="subtitle-text">What would you like to build or discuss today?</h2>
					{/if}
				</div>

				<div class="welcome-dashboard-layout" class:has-project-files={currentProject && currentProject.files && currentProject.files.length > 0}>
					<div class="dashboard-main">
						{#if recentChats.length > 0}
							<div class="dashboard-section">
								<h3 class="section-title">
									<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align: middle; margin-right: 6px; display: inline-block;">
										<path fill="currentColor" d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.67-9.83 0-2.68 2.68-2.68 7.03 0 9.71 2.68 2.68 7.03 2.68 9.71 0 1.96-1.96 2.44-4.69 1.45-7.1h2.1c.9 3.32-.08 7-2.92 9.84-3.87 3.87-10.13 3.87-14 0-3.87-3.87-3.87-10.13 0-14 3.87-3.87 10.13-3.87 14 0L21 3v7.12zM12.5 8v4.25l3.5 2.08-.75 1.23-4.25-2.5V8h1.5z"/>
									</svg>
									Recent Conversations
								</h3>
								<div class="recent-chats-grid">
									{#each recentChats as rChat}
										<button 
											class="recent-chat-card" 
											onclick={() => onSelectConversation?.(rChat.id)}
										>
											<div class="chat-card-top">
												<div class="chat-card-title">{rChat.title}</div>
												<div class="chat-card-snippet">{getChatLastMessageSnippet(rChat)}</div>
											</div>
											<div class="chat-card-footer">
												<span class="chat-card-model">{rChat.model || 'Default'}</span>
												<span class="chat-card-time">{formatRelativeTime(rChat.messages[rChat.messages.length - 1]?.timestamp || rChat.createdAt)}</span>
											</div>
										</button>
									{/each}
								</div>
							</div>
						{:else}
							<div class="empty-dashboard-message animate-fade-in">
								<p>เริ่มพิมพ์คำถามเพื่อเริ่มการสนทนาใหม่ได้ที่ด้านล่างนี้ได้เลย</p>
							</div>
						{/if}

						<div class="dashboard-section help-section animate-fade-in" style="margin-top: 24px;">
							<a href="/features" class="guide-banner-card" id="welcome-guide-banner">
								<div class="banner-content">
									<div class="banner-title">
										<svg viewBox="0 0 24 24" width="16" height="16" class="banner-icon">
											<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-6h2v6zm0-4h-2V7h2v2z"/>
										</svg>
										<span>แนะนำคุณสมบัติและการใช้งานระบบ (Features & Guide)</span>
									</div>
									<p class="banner-desc">เรียนรู้เกี่ยวกับระบบสลับโมเดล AI, การจัดการโครงการพร้อมบริบทและไฟล์อ้างอิง, บันทึกความจำ และคู่มือเริ่มใช้งานด่วน</p>
								</div>
								<div class="banner-action">
									<span>อ่านคู่มือ ↗</span>
								</div>
							</a>
						</div>
					</div>

					{#if currentProject && currentProject.files && currentProject.files.length > 0}
						<div class="dashboard-sidebar">
							<div class="sidebar-box">
								<h3 class="box-title">
									<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align: middle; margin-right: 6px; display: inline-block;">
										<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
									</svg>
									Reference Files ({currentProject.files.length})
								</h3>
								<div class="file-list-scroll">
									{#each currentProject.files as pFile}
										<div class="file-badge-card" title={pFile.name}>
											<span class="file-icon-mini">
												<svg viewBox="0 0 24 24" width="12" height="12">
													<path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
												</svg>
											</span>
											<div class="file-badge-details">
												<span class="file-badge-name">{pFile.name}</span>
												<span class="file-badge-size">{(pFile.size / 1024).toFixed(1)} KB</span>
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Message Thread -->
			<div class="messages-list">
				{#each conversation.messages as msg, idx (msg.id)}
					{#if msg.role !== 'assistant' || msg.content !== ''}
						<div class="message-wrapper" class:user={msg.role === 'user'}>
						<div class="message-avatar">
							{#if msg.role === 'user'}
								<div class="avatar user-avatar">U</div>
							{:else}
								{@const group = getModelGroup(msg.model || conversation?.model)}
								<div class="avatar ai-avatar {group}" title={msg.model || conversation?.model || 'Assistant'}>
									{#if group === 'gemini'}
										<svg viewBox="0 0 24 24" width="18" height="18">
											<path fill="currentColor" d="M9 21c0-5-4-9-9-9 5 0 9-4 9-9 0 5 4 9 9 9-5 0-9 4-9 9zM19 10c0-2.8-2.2-5-5-5 2.8 0 5-2.2 5-5 0 2.8 2.2 5 5 5-2.8 0-5 2.2-5 5z"/>
										</svg>
									{:else if group === 'cloud'}
										<svg viewBox="0 0 24 24" width="18" height="18">
											<path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" width="18" height="18">
											<path fill="currentColor" d="M9 9h6v6H9V9zm12 2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z"/>
										</svg>
									{/if}
								</div>
							{/if}
						</div>
						
						<div class="message-body">
							<div class="message-info">
								<span class="sender-name">
									{msg.role === 'user' ? 'You' : (msg.model || 'Assistant')}
									{#if msg.role === 'assistant' && msg.agentRole && roleStore.getRole(msg.agentRole)}
										<span class="role-badge" title={roleStore.getRole(msg.agentRole)?.desc}>
											{roleStore.getRole(msg.agentRole)?.icon} {roleStore.getRole(msg.agentRole)?.name}
										</span>
									{/if}
								</span>
								<span class="timestamp">
									{formatDateTime(msg.timestamp)}
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
												onkeydown={(e) => handleEditKeydown(e, msg.id)}
												rows="3"
											></textarea>
											<div class="edit-prompt-actions">
												<button class="edit-btn cancel" onclick={() => editingMessageId = null}>
													Cancel
												</button>
												<button 
													class="edit-btn submit" 
													onclick={() => saveEditPrompt(msg.id)}
													disabled={!editingMessageContent.trim() || isGenerating || isBusy}
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
													<div class="user-text-container-with-edit">
														<pre class="user-text-pre">{msg.content}</pre>
														<div class="user-actions-wrapper">
															<button 
																class="message-edit-trigger" 
																onclick={() => startEditPrompt(msg)}
																title="แก้ไขคำถาม"
															>
																<svg viewBox="0 0 24 24" width="14" height="14">
																	<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
																</svg>
															</button>
															<button 
																class="message-resend-trigger" 
																onclick={() => onResendPrompt?.(msg.id)}
																title="ส่งคำถามนี้ซ้ำ"
																disabled={isGenerating || isBusy}
															>
																<svg viewBox="0 0 24 24" width="14" height="14">
																	<path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
																</svg>
															</button>
														</div>
													</div>
												{/if}
											</div>
											{#if !msg.content}
												<div class="user-actions-wrapper borderless">
													<button 
														class="message-edit-trigger" 
														onclick={() => startEditPrompt(msg)}
														title="แก้ไขคำถาม"
													>
														<svg viewBox="0 0 24 24" width="14" height="14">
															<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
														</svg>
													</button>
													<button 
														class="message-resend-trigger" 
														onclick={() => onResendPrompt?.(msg.id)}
														title="ส่งคำถามนี้ซ้ำ"
														disabled={isGenerating || isBusy}
													>
														<svg viewBox="0 0 24 24" width="14" height="14">
															<path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
														</svg>
													</button>
												</div>
											{/if}
										</div>
									{/if}
								{:else}
									<!-- Render parsed markdown with thinking block extraction -->
									{@const parsed = parseThinking(msg.content)}
									{@const isLastMsg = idx === conversation.messages.length - 1}
									{@const isActivelyThinking = parsed.isThinking && isGenerating && isLastMsg}
									{#if parsed.thinking}
										<details class="thoughts-details" bind:open={openedThoughts[msg.id]}>
											<summary class="thoughts-summary">
												<span class="thinking-icon-wrapper">
													<svg class="thinking-icon" class:animate-pulse={isActivelyThinking} viewBox="0 0 24 24" width="14" height="14">
														<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
													</svg>
												</span>
												<span class="thinking-text-label">
													{isActivelyThinking ? 'Thinking Process...' : 'Thought Process'}
												</span>
												<button 
													type="button" 
													class="open-thinking-pane-inline-btn" 
													onclick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenThinking(msg.id); }}
													title="Open thinking process in right pane"
												>
													View in Right Pane ↗
												</button>
											</summary>
											<div class="thoughts-content markdown-body" use:autoScroll={{ active: isActivelyThinking, text: parsed.thinking }}>
												{@html renderMarkdown(parsed.thinking)}
											</div>
										</details>
									{/if}

									{#if parsed.response}
										<div class="assistant-response-content">
											{@html renderMarkdown(parsed.response)}
										</div>
									{:else if isActivelyThinking}
										<div class="thinking-placeholder-msg">
											<div class="typing-indicator small-indicator">
												<span></span><span></span><span></span>
											</div>
										</div>
									{/if}
								{/if}
							</div>

							{#if msg.role === 'assistant' && (msg.completedAt || msg.duration)}
								<div class="generation-metadata animate-fade-in">
									{#if msg.completedAt}
										<span class="meta-item completed-time">
											<svg viewBox="0 0 24 24" width="12" height="12">
												<path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/>
											</svg>
											สิ้นสุด: {new Date(msg.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
										</span>
									{/if}
									{#if msg.duration}
										<span class="meta-item duration-time">
											<svg viewBox="0 0 24 24" width="12" height="12">
												<path fill="currentColor" d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
											</svg>
											ใช้เวลา: {(msg.duration / 1000).toFixed(2)} วินาที
										</span>
									{/if}
								</div>
							{/if}

							<div class="message-actions-row">
								<button 
									type="button" 
									class="msg-action-btn remember-btn"
									class:saved={messageSavedIndicator === msg.id}
									onclick={() => handleRememberMessage(msg)}
									title={messageSavedIndicator === msg.id ? "จำข้อความนี้แล้ว" : "จำข้อความนี้ (Save key fact)"}
								>
									{#if messageSavedIndicator === msg.id}
										<svg viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>
										</svg>
									{/if}
								</button>

								<button 
									type="button" 
									class="msg-action-btn copy-btn"
									class:copied={copiedMessageId === msg.id}
									onclick={() => handleCopyMessage(msg)}
									title={copiedMessageId === msg.id ? "คัดลอกสำเร็จแล้ว!" : "คัดลอกคำตอบ (Copy response)"}
								>
									{#if copiedMessageId === msg.id}
										<svg viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
										</svg>
									{/if}
								</button>

								{#if msg.role === 'assistant'}
									<button 
										type="button" 
										class="msg-action-btn raw-diagnostic-btn"
										onclick={() => rawDiagnosticMsg = msg}
										title="ดูข้อมูลดิบจาก AI (View Raw Response)"
									>
										<svg viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
										</svg>
									</button>
									<button 
										type="button" 
										class="msg-action-btn feedback-btn thumbs-up"
										class:active={msg.feedback === 'up'}
										onclick={() => onToggleMessageFeedback?.(msg.id, 'up')}
										title="คำตอบดี (Good response)"
									>
										<svg viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M1 21h4V9H1v12zm22-10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
										</svg>
									</button>
									<button 
										type="button" 
										class="msg-action-btn feedback-btn thumbs-down"
										class:active={msg.feedback === 'down'}
										onclick={() => onToggleMessageFeedback?.(msg.id, 'down')}
										title="คำตอบไม่ตรงประเด็น/ไม่ดี (Bad response)"
									>
										<svg viewBox="0 0 24 24" width="14" height="14">
											<path fill="currentColor" d="M19 15h4V3h-4v12zm-3-3c0-.26-.05-.5-.14-.73l-3.02-7.05C12.54 3.5 11.83 3 11 3H2c-1.1 0-2 .9-2 2v10c0 .55.22 1.05.59 1.41L7.17 23l.94-.94c.27-.27.44-.65.44-1.06l-.03-.32L7.57 15H14c1.1 0 2-.9 2-2v-1z"/>
										</svg>
									</button>
								{/if}
							</div>
						</div>
					</div>
					{/if}
				{/each}

				{#if showThinking}
					{@const activeModel = conversation.messages[conversation.messages.length - 1]?.model || conversation.model}
					{@const group = getModelGroup(activeModel)}
					<div class="message-wrapper assistant generating">
						<div class="message-avatar">
							<div class="avatar ai-avatar animate-pulse {group}" title={activeModel || 'Assistant'}>
								{#if group === 'gemini'}
									<svg viewBox="0 0 24 24" width="18" height="18">
										<path fill="currentColor" d="M9 21c0-5-4-9-9-9 5 0 9-4 9-9 0 5 4 9 9 9-5 0-9 4-9 9zM19 10c0-2.8-2.2-5-5-5 2.8 0 5-2.2 5-5 0 2.8 2.2 5 5 5-2.8 0-5 2.2-5 5z"/>
									</svg>
								{:else if group === 'cloud'}
									<svg viewBox="0 0 24 24" width="18" height="18">
										<path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
									</svg>
								{:else}
									<svg viewBox="0 0 24 24" width="18" height="18">
										<path fill="currentColor" d="M9 9h6v6H9V9zm12 2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z"/>
									</svg>
								{/if}
							</div>
						</div>
						<div class="message-body">
							<div class="message-info">
								<span class="sender-name">
									{conversation.messages[conversation.messages.length - 1].model || conversation.model || 'Ollama'}
								</span>
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
	
	{#if lightboxImage}
		<div class="lightbox-overlay" onclick={closeLightbox} onkeydown={(e) => e.key === 'Escape' && closeLightbox()} role="button" tabindex="-1" aria-label="Close Lightbox" transition:fade={{ duration: 150 }}>
			<button class="lightbox-close" onclick={closeLightbox} aria-label="Close Lightbox">&times;</button>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
				<img src={lightboxImage} alt={lightboxAlt} class="lightbox-content" />
			</div>
			{#if lightboxAlt}
				<div class="lightbox-caption">{lightboxAlt}</div>
			{/if}
		</div>
	{/if}

	{#if rawDiagnosticMsg}
		<div 
			class="lightbox-overlay raw-diagnostic-overlay" 
			onclick={closeRawDiagnostic} 
			onkeydown={(e) => e.key === 'Escape' && closeRawDiagnostic()} 
			role="button" 
			tabindex="-1" 
			aria-label="Close Diagnostic Overlay" 
			transition:fade={{ duration: 150 }}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="raw-diagnostic-card" onclick={(e) => e.stopPropagation()}>
				<button class="raw-diagnostic-close" onclick={closeRawDiagnostic} aria-label="Close Diagnostic">&times;</button>
				<div class="raw-diagnostic-header">
					<h3>ข้อมูลดิบจาก AI (Raw Output)</h3>
					<div class="raw-diagnostic-header-actions">
						<span class="diagnostic-model-badge">{rawDiagnosticMsg.model || 'Unknown Model'}</span>
						<button class="copy-raw-btn" onclick={handleCopyRawDiagnostic}>
							{#if rawDiagnosticCopied}
								<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px; display: inline-block;">
									<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
								</svg>
								คัดลอกแล้ว!
							{:else}
								<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px; display: inline-block;">
									<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
								</svg>
								คัดลอก
							{/if}
						</button>
					</div>
				</div>
				<div class="raw-diagnostic-body-single">
					<textarea readonly class="diagnostic-textarea-raw">{rawDiagnosticMsg.content || ''}</textarea>
				</div>
			</div>
		</div>
	{/if}

	{#if lightboxMermaidCode}
		<div 
			class="lightbox-overlay mermaid-lightbox" 
			onclick={closeMermaidLightbox} 
			onkeydown={(e) => e.key === 'Escape' && closeMermaidLightbox()} 
			role="button" 
			tabindex="-1" 
			aria-label="Close Lightbox" 
			transition:fade={{ duration: 150 }}
		>
			<button class="lightbox-close" onclick={closeMermaidLightbox} aria-label="Close Lightbox">&times;</button>
			
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="lightbox-mermaid-header" onclick={(e) => e.stopPropagation()}>
				<span class="lightbox-mermaid-title">Interactive Flowchart Viewer</span>
				<div class="lightbox-mermaid-controls">
					<button class="control-btn" onclick={zoomIn} title="Zoom In">+</button>
					<span class="zoom-indicator">{Math.round(lightboxMermaidScale * 100)}%</span>
					<button class="control-btn" onclick={zoomOut} title="Zoom Out">-</button>
					<button class="control-btn" onclick={zoomReset} title="Reset View">Reset</button>
				</div>
			</div>

			<div 
				class="lightbox-mermaid-viewport" 
				onclick={(e) => e.stopPropagation()}
				onmousedown={startDrag}
				onmousemove={drag}
				onmouseup={endDrag}
				onmouseleave={endDrag}
				role="presentation"
				style="cursor: {lightboxMermaidIsDragging ? 'grabbing' : 'grab'}"
			>
				<div 
					class="lightbox-mermaid-content"
					bind:this={lightboxMermaidContainer}
					style="transform: translate({lightboxMermaidOffset.x}px, {lightboxMermaidOffset.y}px) scale({lightboxMermaidScale}); transform-origin: center;"
				>
					<div class="mermaid-loading">
						<div class="spinner-glow small"></div>
						<span>Rendering flowchart...</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.chat-area {
		flex: 1;
		min-height: 0; /* Prevents flex items from overflowing their container */
		display: flex;
		flex-direction: column;
		background-color: var(--bg-primary);
		position: relative;
		container-type: inline-size;
	}

	.chat-header {
		height: var(--header-height, 56px);
		border-bottom: 1px solid var(--border-color);
		background-color: var(--header-bg);
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

	.chat-title-group {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		flex: 1;
		margin-right: 16px;
	}

	.sidebar-toggle-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 6px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--transition-fast), color var(--transition-fast);
		flex-shrink: 0;
	}

	.sidebar-toggle-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.chat-title {
		font-family: var(--font-title);
		font-weight: 500;
		font-size: 1.05rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
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
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
		flex-shrink: 0;
	}

	.export-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
		transform: scale(1.05);
	}

	.export-btn:active {
		transform: scale(0.95);
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
		background-color: var(--bg-secondary);
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

	.appearance-controls {
		position: relative;
		display: inline-block;
	}

	.appearance-toggle-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 34px;
		padding: 0 12px;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 17px;
		color: var(--text-secondary);
		font-weight: 500;
		font-size: 0.85rem;
		transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
		cursor: pointer;
		outline: none;
	}

	.appearance-toggle-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
		transform: scale(1.02);
	}

	.appearance-toggle-btn:active {
		transform: scale(0.98);
	}

	.font-icon-svg {
		color: var(--accent-blue);
		flex-shrink: 0;
	}

	.font-name-label {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.appearance-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 12px 14px;
		width: 220px;
		box-shadow: var(--shadow-lg);
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.dropdown-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-bottom: 1px solid var(--border-light);
		padding-bottom: 10px;
	}

	.dropdown-section.last {
		border-bottom: none;
		padding-bottom: 0;
	}

	.section-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.font-family-select-wrapper {
		position: relative;
		width: 100%;
	}

	.appearance-select {
		width: 100%;
		height: 32px;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 0 28px 0 10px;
		font-size: 0.85rem;
		color: var(--text-primary);
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		outline: none;
		transition: border-color var(--transition-fast);
	}

	.appearance-select:focus {
		border-color: var(--accent-blue);
	}

	.chevron-select {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		color: var(--text-muted);
	}

	.zoom-controls-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.zoom-btn {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		background-color: var(--bg-primary);
		color: var(--text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.zoom-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.zoom-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.zoom-reset-btn {
		flex: 1;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		background-color: var(--bg-primary);
		color: var(--text-primary);
		font-size: 0.82rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.zoom-reset-btn:hover {
		background-color: var(--bg-hover);
	}

	.theme-mode-row {
		display: flex;
		gap: 8px;
		width: 100%;
	}

	.theme-mode-btn {
		flex: 1;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		background-color: var(--bg-primary);
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-weight: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.theme-mode-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.theme-mode-btn.active {
		background-color: color-mix(in srgb, var(--accent-blue) 12%, var(--bg-secondary));
		border-color: var(--accent-blue);
		color: var(--accent-blue);
		font-weight: 600;
	}

	.theme-color-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 4px 0;
	}

	.color-dot-item {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.15);
		transition: transform var(--transition-fast), box-shadow var(--transition-fast);
		cursor: pointer;
		padding: 0;
		outline: none;
	}

	.color-dot-item:hover {
		transform: scale(1.15);
	}

	.color-dot-item.active {
		transform: scale(1.1);
		box-shadow: 0 0 0 2px var(--bg-secondary), 0 0 0 4px var(--accent-blue);
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
		max-width: 1280px;
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

	/* Dynamic Welcome Screen Extensions */
	.project-indicator-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: rgba(168, 199, 250, 0.08);
		border: 1px solid rgba(168, 199, 250, 0.2);
		color: var(--accent-blue);
		padding: 4px 10px;
		border-radius: 99px;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		width: fit-content;
		margin-bottom: 12px;
	}

	.project-folder-icon {
		color: var(--accent-blue);
	}

	.project-welcome-title {
		font-family: var(--font-title);
		font-size: 2.8rem;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.2;
		margin-bottom: 8px;
	}

	.welcome-dashboard-layout {
		display: flex;
		flex-direction: row;
		gap: 24px;
		width: 100%;
	}

	.dashboard-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 32px;
		min-width: 0;
	}

	.dashboard-sidebar {
		width: 280px;
		flex-shrink: 0;
	}

	.dashboard-section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.section-title {
		font-family: var(--font-title);
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
		display: flex;
		align-items: center;
		opacity: 0.9;
	}

	.empty-dashboard-message {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 32px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.95rem;
		box-shadow: var(--shadow-sm);
	}

	.recent-chats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.recent-chat-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 16px;
		text-align: left;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 120px;
		cursor: pointer;
		position: relative;
		transition: background-color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
		min-width: 0;
		font-family: inherit;
	}

	.recent-chat-card:hover {
		background-color: var(--bg-hover);
		border-color: var(--border-light);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
	}

	.recent-chat-card:active {
		transform: translateY(0);
	}

	.chat-card-top {
		min-width: 0;
		width: 100%;
	}

	.chat-card-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 6px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chat-card-snippet {
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
		height: 2.8em;
	}

	.chat-card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.72rem;
		width: 100%;
		border-top: 1px solid rgba(255, 255, 255, 0.03);
		padding-top: 8px;
		margin-top: 6px;
	}

	.chat-card-model {
		color: var(--accent-blue);
		background-color: rgba(168, 199, 250, 0.08);
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: 500;
		max-width: 60%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chat-card-time {
		color: var(--text-muted);
	}



	/* Sidebar Box styling */
	.sidebar-box {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		height: 100%;
		max-height: 400px;
	}

	.box-title {
		font-family: var(--font-title);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
		opacity: 0.9;
	}

	.file-list-scroll {
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
		flex: 1;
		padding-right: 4px;
	}

	.file-list-scroll::-webkit-scrollbar {
		width: 4px;
	}

	.file-list-scroll::-webkit-scrollbar-thumb {
		background: var(--border-color);
		border-radius: 99px;
	}

	.file-badge-card {
		display: flex;
		align-items: center;
		gap: 10px;
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 8px 12px;
		min-width: 0;
		transition: border-color var(--transition-fast);
	}

	.file-badge-card:hover {
		border-color: var(--accent-blue);
	}

	.file-icon-mini {
		color: var(--text-muted);
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.file-badge-details {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.file-badge-name {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-badge-size {
		font-size: 0.7rem;
		color: var(--text-muted);
		margin-top: 1px;
	}

	/* Responsive tweaks */
	@media (max-width: 1024px) {
		.welcome-dashboard-layout {
			flex-direction: column;
		}

		.dashboard-sidebar {
			width: 100%;
		}

		.sidebar-box {
			max-height: 250px;
		}
	}

	@media (max-width: 600px) {
		.recent-chats-grid {
			grid-template-columns: 1fr;
		}
	}

	/* Message thread styling */
	.messages-list {
		max-width: 1280px;
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

	@container (min-width: 1120px) {
		.message-wrapper {
			margin-left: -56px; /* Offset the avatar (36px width + 20px gap) to the left gutter */
		}
	}

	.message-wrapper.user {
		/* Right-align user messages slightly for cleaner hierarchy */
		flex-direction: row;
	}

	@media (max-width: 768px) {
		.message-wrapper, .message-wrapper.user {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 8px 12px;
			align-items: flex-start;
		}

		.message-body {
			display: contents;
		}

		.message-avatar {
			grid-column: 1;
			grid-row: 1;
		}

		.message-info {
			grid-column: 2;
			grid-row: 1;
			margin-bottom: 0;
			align-self: center;
		}

		.message-content {
			grid-column: 1 / -1;
			grid-row: 2;
		}
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
		color: #ffffff;
		box-shadow: var(--shadow-sm);
		transition: transform var(--transition-fast), box-shadow var(--transition-fast);
	}

	.ai-avatar:hover {
		transform: scale(1.05);
		box-shadow: var(--shadow-md);
	}

	.ai-avatar.local {
		background: linear-gradient(135deg, #1e293b, #475569);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.ai-avatar.cloud {
		background: linear-gradient(135deg, #0284c7, #6366f1);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.ai-avatar.gemini {
		background: linear-gradient(135deg, #7c3aed, #db2777, #2563eb);
		border: 1px solid rgba(255, 255, 255, 0.1);
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

	.assistant-response-content {
		width: 100%;
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
		max-width: 100%;
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

	.user-text-container-with-edit {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
	}

	.user-text-container-with-edit .user-text-pre {
		max-width: calc(100% - 40px);
	}

	.user-actions-wrapper {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: center;
		margin-top: 8px;
		flex-shrink: 0;
	}

	.user-actions-wrapper.borderless {
		margin-top: 0;
	}

	.user-message-container:hover .message-edit-trigger {
		opacity: 1;
	}

	.user-message-container:hover .message-resend-trigger {
		opacity: 1;
	}

	.user-message-container:hover .message-resend-trigger:disabled {
		opacity: 0.3;
	}

	.message-edit-trigger, .message-resend-trigger {
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
		flex-shrink: 0;
		cursor: pointer;
	}

	.message-edit-trigger:hover, .message-resend-trigger:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.message-resend-trigger:disabled {
		cursor: not-allowed;
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

	.context-toggle-btn-header {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
		cursor: pointer;
		flex-shrink: 0;
	}

	.context-toggle-btn-header:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
		transform: scale(1.05);
	}

	.context-toggle-btn-header:active {
		transform: scale(0.95);
	}

	.context-toggle-btn-header.active-panel {
		background-color: color-mix(in srgb, var(--accent-blue) 15%, transparent);
		color: var(--accent-blue);
		border-color: var(--accent-blue);
	}

	/* Collapsible thoughts/thinking block styling */
	.thoughts-details {
		background-color: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		margin-bottom: 12px;
		overflow: hidden;
		transition: border-color var(--transition-fast);
	}

	.thoughts-details[open] {
		border-color: var(--border-light);
	}

	.thoughts-summary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		font-size: 0.8rem;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
		font-weight: 500;
	}

	.thoughts-summary:hover {
		color: var(--text-secondary);
		background-color: rgba(255, 255, 255, 0.01);
	}

	.thinking-icon-wrapper {
		color: #e2a54b;
		display: flex;
		align-items: center;
	}

	.thinking-text-label {
		flex: 1;
	}

	.open-thinking-pane-inline-btn {
		background: none;
		border: none;
		color: var(--accent-blue);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		transition: background-color var(--transition-fast), color var(--transition-fast);
		margin-left: auto;
	}

	.open-thinking-pane-inline-btn:hover {
		background-color: rgba(168, 199, 250, 0.1);
		color: var(--text-primary);
		text-decoration: underline;
	}

	.thoughts-content {
		padding: 10px 14px;
		border-top: 1px solid var(--border-light);
		background-color: rgba(0, 0, 0, 0.05);
		max-height: 200px;
		overflow-y: auto;
		font-size: calc(var(--chat-font-size, 15px) * 0.82);
	}

	.thoughts-content :global(p) {
		margin-bottom: 0.5rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.thoughts-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.thoughts-content :global(h1),
	.thoughts-content :global(h2),
	.thoughts-content :global(h3),
	.thoughts-content :global(h4),
	.thoughts-content :global(h5),
	.thoughts-content :global(h6) {
		font-size: 1.05em;
		margin-top: 10px;
		margin-bottom: 4px;
		color: var(--text-secondary);
	}

	.thoughts-content :global(ul),
	.thoughts-content :global(ol) {
		margin-bottom: 8px;
		padding-left: 20px;
	}

	.thoughts-content :global(li) {
		color: var(--text-secondary);
		margin-bottom: 2px;
	}

	.thoughts-content :global(code) {
		font-size: 0.9em;
	}

	.thoughts-content :global(.code-block-wrapper) {
		margin: 8px 0;
		font-size: 0.95em;
	}

	.thoughts-content :global(.code-block-header) {
		padding: 4px 10px;
	}

	.thoughts-content :global(pre[class*="language-"]) {
		padding: 8px 12px;
	}

	.thinking-placeholder-msg {
		display: flex;
		align-items: center;
		padding: 8px 0;
	}

	.small-indicator {
		padding: 0;
		gap: 4px;
	}

	.small-indicator span {
		width: 6px;
		height: 6px;
	}

	.theme-toggle-btn {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--active-theme-color, var(--text-secondary));
		background-color: var(--bg-secondary);
		border: 1px solid var(--active-theme-color, var(--border-color));
		transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
		flex-shrink: 0;
	}

	.theme-toggle-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
		transform: scale(1.05);
	}

	.theme-toggle-btn:active {
		transform: scale(0.95);
	}

	.theme-toggle-btn svg {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	.generation-metadata {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 10px;
		font-size: 0.72rem;
		color: var(--text-muted);
		border-top: 1px dashed var(--border-color);
		padding-top: 8px;
		width: 100%;
	}

	.generation-metadata .meta-item {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.generation-metadata svg {
		opacity: 0.7;
	}

	.message-actions-row {
		display: flex;
		gap: 8px;
		margin-top: 8px;
		opacity: 0;
		transition: opacity var(--transition-fast);
	}

	.message-wrapper:hover .message-actions-row {
		opacity: 1.0;
	}

	.msg-action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid var(--border-color);
		border-radius: 50%;
		width: 28px;
		height: 28px;
		color: var(--text-muted);
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
	}

	.msg-action-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	.msg-action-btn:active {
		transform: scale(0.9);
	}

	.msg-action-btn.saved {
		color: #e2a54b;
		border-color: rgba(226, 165, 75, 0.4);
		background-color: rgba(226, 165, 75, 0.05);
	}

	.msg-action-btn.copy-btn.copied {
		color: #4caf50;
		border-color: rgba(76, 175, 80, 0.4);
		background-color: rgba(76, 175, 80, 0.05);
	}

	.msg-action-btn.feedback-btn {
		transition: transform 0.1s ease, color 0.15s ease, background-color 0.15s ease;
	}

	.msg-action-btn.thumbs-up.active {
		color: #4caf50;
		border-color: rgba(76, 175, 80, 0.4);
		background-color: rgba(76, 175, 80, 0.08);
	}
	
	.msg-action-btn.thumbs-up:hover:not(.active) {
		color: #4caf50;
		border-color: rgba(76, 175, 80, 0.2);
	}

	.msg-action-btn.thumbs-down.active {
		color: #f44336;
		border-color: rgba(244, 67, 54, 0.4);
		background-color: rgba(244, 67, 54, 0.08);
	}
	
	.msg-action-btn.thumbs-down:hover:not(.active) {
		color: #f44336;
		border-color: rgba(244, 67, 54, 0.2);
	}

	.role-badge {
		font-size: 0.72rem;
		font-weight: 600;
		background-color: var(--bg-secondary);
		color: var(--text-secondary);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 1px 6px;
		margin-left: 8px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		vertical-align: middle;
	}

	/* Raw Diagnostic Styles */
	.msg-action-btn.raw-diagnostic-btn:hover {
		color: var(--accent-blue);
		border-color: rgba(66, 133, 244, 0.4);
		background-color: rgba(66, 133, 244, 0.05);
	}

	.raw-diagnostic-overlay {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.raw-diagnostic-card {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		width: 90vw;
		max-width: 960px;
		height: 85vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: var(--shadow-lg);
		animation: zoomIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		position: relative;
	}

	.raw-diagnostic-close {
		position: absolute;
		top: 12px;
		right: 16px;
		color: var(--text-secondary);
		font-size: 1.5rem;
		line-height: 1;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: transparent;
		transition: background-color var(--transition-fast), color var(--transition-fast);
		border: none;
		cursor: pointer;
		z-index: 10;
	}

	.raw-diagnostic-close:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.raw-diagnostic-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		border-bottom: 1px solid var(--border-color);
		background-color: var(--bg-secondary);
	}

	.raw-diagnostic-header h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.diagnostic-model-badge {
		font-size: 0.75rem;
		font-weight: 600;
		background-color: var(--border-color);
		color: var(--text-secondary);
		padding: 3px 10px;
		border-radius: 20px;
	}

	.raw-diagnostic-header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-right: 48px; /* Give room for close button */
	}

	.raw-diagnostic-body-single {
		flex: 1;
		padding: 24px;
		display: flex;
		flex-direction: column;
	}

	.diagnostic-textarea-raw {
		flex: 1;
		width: 100%;
		height: 100%;
		resize: none;
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 16px;
		font-family: 'Courier New', Courier, monospace;
		font-size: calc(var(--chat-font-size, 15px) * 0.9);
		line-height: 1.5;
		color: var(--text-primary);
		outline: none;
		white-space: pre;
		overflow: auto;
	}

	.copy-raw-btn {
		background: none;
		border: 1px solid var(--border-color);
		color: var(--text-secondary);
		padding: 4px 12px;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
	}

	.copy-raw-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	@media (max-width: 768px) {
		.raw-diagnostic-card {
			height: 90vh;
			width: 95vw;
		}
	}

	/* Guide banner on dashboard styles */
	.guide-banner-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(168, 199, 250, 0.05) 100%);
		border: 1px dashed var(--border-color);
		border-radius: 16px;
		padding: 20px 24px;
		color: inherit;
		text-decoration: none;
		transition: all var(--transition-normal);
		cursor: pointer;
		gap: 16px;
		box-shadow: var(--shadow-sm);
	}

	.guide-banner-card:hover {
		border-color: var(--accent-blue);
		transform: translateY(-2px);
		box-shadow: var(--shadow-md), 0 4px 20px rgba(168, 199, 250, 0.08);
		background: linear-gradient(135deg, var(--bg-hover) 0%, rgba(168, 199, 250, 0.08) 100%);
	}

	.banner-content {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}

	.banner-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-title);
		font-size: 1rem;
		font-weight: 600;
		color: var(--accent-blue);
	}

	.banner-icon {
		flex-shrink: 0;
		color: var(--accent-blue);
	}

	.banner-desc {
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
		margin: 0;
		white-space: normal;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.banner-action {
		flex-shrink: 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--accent-blue);
		background-color: rgba(168, 199, 250, 0.08);
		padding: 6px 14px;
		border-radius: 99px;
		border: 1px solid rgba(168, 199, 250, 0.16);
		transition: all var(--transition-fast);
	}

	.guide-banner-card:hover .banner-action {
		background-color: var(--accent-blue);
		color: var(--accent-text);
		box-shadow: 0 2px 8px rgba(168, 199, 250, 0.2);
	}

	@media (max-width: 600px) {
		.guide-banner-card {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}
		.banner-action {
			align-self: flex-end;
		}
	}
</style>
