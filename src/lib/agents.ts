export type AgentRole = 'general' | 'developer' | 'db_architect' | 'ui_ux' | 'writer';

export interface RoleConfig {
	name: string;
	prompt: string;
	icon: string;
	desc: string;
}

export const ROLE_PROMPTS: Record<AgentRole, RoleConfig> = {
	general: {
		name: 'General Assistant',
		prompt: 'You are a helpful and polite general-purpose AI assistant.',
		icon: '🤖',
		desc: 'ผู้ช่วยทั่วไปสำหรับการพูดคุยและตอบคำถามทั่วไป'
	},
	developer: {
		name: 'Senior Developer',
		prompt: 'You are an expert senior software engineer. Focus on writing optimal, clean, secure, and modern code. Adhere to Svelte 5 runes best practices (using $state, $derived, $props, $effect, etc.) and TypeScript typing guidelines. Keep explanations concise, structured, and focused on implementation details.',
		icon: '💻',
		desc: 'ผู้เชี่ยวชาญด้านการเขียนโค้ด พัฒนาซอฟต์แวร์ และโครงสร้างของระบบ'
	},
	db_architect: {
		name: 'Database Architect',
		prompt: 'You are an expert database architect and administrator. Focus on database schemas, relationships, indexing, transactional integrity, client-side databases (like IndexedDB, Dexie.js), and database performance. Explain data storage decisions clearly.',
		icon: '🗄️',
		desc: 'ผู้เชี่ยวชาญด้านการออกแบบโครงสร้างฐานข้อมูล การคิวรี และ IndexedDB/Dexie'
	},
	ui_ux: {
		name: 'UI/UX Designer',
		prompt: 'You are a creative UI/UX designer and frontend developer. Focus on creating premium visual aesthetics, clean layout structures (CSS flexbox/grid), responsive styling, modern colors (like tailored HSL, sleek dark modes, gradients, glassmorphism), subtle transitions/animations, and modern typography. Ensure visual excellence.',
		icon: '🎨',
		desc: 'ผู้เชี่ยวชาญด้านการออกแบบ UI/UX, แต่งหน้าเว็บด้วย CSS และความสวยงามทันสมัย'
	},
	writer: {
		name: 'Technical Writer',
		prompt: 'You are a professional technical writer and documenter. Focus on explaining concepts clearly, writing step-by-step guides, summaries, tutorials, and structured README documents using proper Markdown formatting. Help the user understand the underlying reasons behind solutions.',
		icon: '✍️',
		desc: 'ผู้เชี่ยวชาญด้านการอธิบายหลักการ สรุปใจความสำคัญ และเขียนเอกสารอ้างอิง'
	}
};

/**
 * Classifies a user prompt into one of the specialized Agent Roles.
 * Rules-based, synchronous, and instant.
 */
export function classifyPrompt(prompt: string): AgentRole {
	const text = prompt.toLowerCase();

	// 1. UI/UX Designer
	if (
		text.includes('css') ||
		text.includes('style') ||
		text.includes('color') ||
		text.includes('layout') ||
		text.includes('flexbox') ||
		text.includes('grid') ||
		text.includes('animation') ||
		text.includes('ui/') ||
		text.includes('ux') ||
		text.includes('font') ||
		text.includes('responsive') ||
		text.includes('pixel') ||
		text.includes('glassmorphism') ||
		text.includes('gradient') ||
		text.includes('aesthetic') ||
		text.includes('สวย') ||
		text.includes('แต่งหน้าเว็บ')
	) {
		return 'ui_ux';
	}

	// 2. Database Architect
	if (
		text.includes('database') ||
		text.includes('sql') ||
		text.includes('indexeddb') ||
		text.includes('dexie') ||
		text.includes('schema') ||
		text.includes('migration') ||
		text.includes('query') ||
		text.includes('table') ||
		text.includes('key-value') ||
		text.includes('nosql') ||
		text.includes('mongodb') ||
		text.includes('postgresql') ||
		text.includes('prisma') ||
		text.includes('orm') ||
		text.includes('ฐานข้อมูล') ||
		text.includes('ตารางข้อมูล')
	) {
		return 'db_architect';
	}

	// 3. Technical Writer / Explainer
	if (
		text.includes('explain') ||
		text.includes('document') ||
		text.includes('readme') ||
		text.includes('tutorial') ||
		text.includes('guide') ||
		text.includes('article') ||
		text.includes('documentation') ||
		text.includes('write a report') ||
		text.includes('summary') ||
		text.includes('summarize') ||
		text.includes('อธิบาย') ||
		text.includes('สรุป') ||
		text.includes('เขียนเอกสาร') ||
		text.includes('บทความ')
	) {
		return 'writer';
	}

	// 4. Developer / Coder
	if (
		text.includes('code') ||
		text.includes('svelte') ||
		text.includes('typescript') ||
		text.includes('javascript') ||
		text.includes('python') ||
		text.includes('bug') ||
		text.includes('debug') ||
		text.includes('error') ||
		text.includes('compile') ||
		text.includes('runes') ||
		text.includes('function') ||
		text.includes('api') ||
		text.includes('git') ||
		text.includes('docker') ||
		text.includes('react') ||
		text.includes('vue') ||
		text.includes('compiler') ||
		text.includes('syntax') ||
		text.includes('เขียนโค้ด') ||
		text.includes('ฟังก์ชัน') ||
		text.includes('บั๊ก') ||
		text.includes('เขียนโปรแกรม')
	) {
		return 'developer';
	}

	return 'general';
}
