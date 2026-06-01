<script lang="ts">
	import { onMount } from 'svelte';

	// Handle theme loading on mount to match the rest of the application
	let activeTheme = $state('dark-blue');
	let activeFontFamily = $state('inter');

	onMount(() => {
		const storedTheme = localStorage.getItem('theme');
		if (storedTheme) {
			activeTheme = storedTheme;
			document.documentElement.setAttribute('data-theme', storedTheme);
		}
		
		const storedFontFamily = localStorage.getItem('chat_font_family');
		if (storedFontFamily) {
			activeFontFamily = storedFontFamily;
		}
	});

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
</script>

<svelte:head>
	<title>คุณสมบัติและแนะนำการใช้งาน | Order AI</title>
	<meta name="description" content="ทำความรู้จักคุณสมบัติเด่น จุดเด่น และคู่มือการใช้งานระบบช่วยวิเคราะห์และตอบคำถามอัจฉริยะ Order AI" />
</svelte:head>

<div class="features-page" style="--chat-font-family: {getFontFamilyCss(activeFontFamily)}; font-family: var(--chat-font-family);">
	<!-- Header Section -->
	<header class="page-header">
		<div class="header-container">
			<a href="/" class="back-btn" id="features-back-btn">
				<svg viewBox="0 0 24 24" width="18" height="18">
					<path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
				</svg>
				<span>กลับหน้าหลัก (Back to Chats)</span>
			</a>
			
			<div class="header-main animate-fade-in">
				<div class="logo-badge">
					<svg class="logo-icon" viewBox="0 0 24 24" width="28" height="28">
						<path fill="currentColor" d="M12 2L2 22h20L12 2zm0 3.99L18.8 19H5.2L12 5.99zM12 17c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v4c0 .55.45 1 1 1zm0-7.75c.41 0 .75-.34.75-.75s-.34-.75-.75-.75-.75.34-.75.75.34.75.75.75z"/>
					</svg>
					<span>Order AI Platform</span>
				</div>
				<h1>คุณสมบัติและคู่มือแนะนำการใช้งาน</h1>
				<p class="subtitle">ระบบช่วยคิด วิเคราะห์โค้ด และเขียนเอกสารระดับสูงที่มีประสิทธิภาพและปลอดภัย</p>
			</div>
		</div>
	</header>

	<main class="page-content container">
		<!-- Section: Differentiators / Highlights -->
		<section class="highlights-section animate-fade-in">
			<div class="section-header">
				<h2>✨ จุดเด่นที่ทำให้เราแตกต่าง</h2>
				<p>ประสิทธิภาพที่คุ้มค่า ความปลอดภัยของข้อมูล และความยืดหยุ่นในการทำงาน</p>
			</div>
			
			<div class="highlights-grid">
				<div class="highlight-card">
					<div class="card-icon privacy-icon">
						<svg viewBox="0 0 24 24" width="28" height="28">
							<path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
						</svg>
					</div>
					<h3>Privacy-First & Local AI</h3>
					<p>เชื่อมต่อกับ Ollama ในเครื่องคอมพิวเตอร์ของคุณเองโดยตรง ข้อมูลบทสนทนาและไฟล์รหัสโปรแกรมทั้งหมดไม่ผ่านอินเทอร์เน็ต ปลอดภัยสำหรับข้อมูลบริษัทหรือข้อมูลส่วนบุคคล</p>
				</div>

				<div class="highlight-card">
					<div class="card-icon svelte-icon">
						<svg viewBox="0 0 24 24" width="28" height="28">
							<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 6h-4v2h4v2h-4v2h4v2H9V7h6v2z"/>
						</svg>
					</div>
					<h3>Svelte 5 Runes & Bun</h3>
					<p>เขียนด้วยภาษาเว็บยุคใหม่ที่มีความเร็วและอัตราตอบสนองที่ลื่นไหลระดับมิลลิวินาที ประหยัดการใช้ทรัพยากรเครื่องของคุณอย่างมาก พร้อมรองรับการประมวลผลแบบ Real-time</p>
				</div>

				<div class="highlight-card">
					<div class="card-icon theme-icon">
						<svg viewBox="0 0 24 24" width="28" height="28">
							<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
						</svg>
					</div>
					<h3>Personalized Appearance</h3>
					<p>ปรับรูปแบบได้ตามใจคุณด้วยตัวเลือกธีมสีมากกว่า 10 เฉดสี ทั้งโหมดกลางวัน (Light) และโหมดกลางคืน (Dark) พร้อมระบบซูมและปรับเปลี่ยนแบบอักษร (Fonts) ยอดนิยม เช่น Inter, Outfit และ Fira Code</p>
				</div>
			</div>
		</section>

		<!-- Section: Key Features -->
		<section class="features-section animate-fade-in">
			<div class="section-header">
				<h2>🚀 คุณสมบัติความสามารถของระบบ (Core Features)</h2>
				<p>รวบรวมฟังก์ชันที่จะช่วยปรับปรุงเวิร์กโฟลว์การทำงานของคุณไปอีกระดับ</p>
			</div>

			<div class="features-list-grid">
				<!-- Feature 1 -->
				<div class="feature-item-card">
					<div class="card-glow"></div>
					<div class="card-header-bar">
						<span class="feature-badge">Provider</span>
						<h3>ระบบสลับตัวประมวลผล Multi-Model</h3>
					</div>
					<p>คุณสามารถตั้งค่าสลับการเชื่อมต่อเพื่อใช้โมเดลประสิทธิภาพสูงได้หลากหลายช่องทางในเวลาเดียวกัน:</p>
					<ul>
						<li><strong>Ollama Local:</strong> รันโมเดลยอดนิยม (เช่น Llama 3, DeepSeek-R1, Qwen 2.5) ภายในเครื่องเพื่อความเป็นส่วนตัวสูงสุด</li>
						<li><strong>Ollama Cloud:</strong> เชื่อมต่อไปยังเซิร์ฟเวอร์คลาวด์เพื่อการคำนวณที่รวดเร็วกว่าเดิม</li>
						<li><strong>Google Gemini API:</strong> รองรับการสลับมาใช้งานระบบประมวลผลระดับโลก เช่น Gemini 1.5 Pro / Flash ที่ขึ้นชื่อเรื่อง Context Window ที่ยาวมหาศาล</li>
					</ul>
				</div>

				<!-- Feature 2 -->
				<div class="feature-item-card">
					<div class="card-glow"></div>
					<div class="card-header-bar">
						<span class="feature-badge">Context</span>
						<h3>พื้นที่ทำงานตามโครงการ (Project Workspaces)</h3>
					</div>
					<p>ระบบแยกพื้นที่คุยแยกกันอย่างเด็ดขาดตามหัวข้อหรือโปรเจกต์งานที่คุณกำลังทำ:</p>
					<ul>
						<li><strong>Project System Prompt:</strong> กำหนดบริบทเฉพาะของโปรเจกต์นั้น ๆ (เช่น "คุณคือผู้เชี่ยวชาญด้านภาษา Rust") ระบบจะแนบคำสั่งนี้ไปในทุกแชทของโปรเจกต์โดยอัตโนมัติ</li>
						<li><strong>การจัดกลุ่มบทสนทนา:</strong> จัดกลุ่มแชทที่คุยเรื่องเดียวกันไว้ภายใต้โฟลเดอร์โปรเจกต์ ช่วยรักษาประวัติการสนทนาให้มีระเบียบ</li>
					</ul>
				</div>

				<!-- Feature 3 -->
				<div class="feature-item-card">
					<div class="card-glow"></div>
					<div class="card-header-bar">
						<span class="feature-badge">Knowledge</span>
						<h3>ระบบอัปโหลดไฟล์อ้างอิง (Reference Files)</h3>
					</div>
					<p>ช่วยส่งบริบทโค้ดหรือเอกสารให้กับ AI เพื่อใช้อ้างอิงในการตอบคำถามได้อย่างสมบูรณ์แบบ:</p>
					<ul>
						<li>รองรับไฟล์ข้อความและซอร์สโค้ดหลากหลายนามสกุล (.txt, .md, .js, .ts, .svelte, .json, .html, .css)</li>
						<li>ระบบจะนำเนื้อหาในไฟล์แนบส่งไปเป็นประวัติความรู้แบบอัตโนมัติ เพื่อให้ AI อ้างอิงคำตอบได้แม่นยำขึ้น</li>
						<li>โควตาขนาดไฟล์รองรับสูงถึง 1.5 MB เพื่อให้ทำงานได้ลื่นไหลโดยไม่เปลืองเนื้อที่จัดเก็บ</li>
					</ul>
				</div>

				<!-- Feature 4 -->
				<div class="feature-item-card">
					<div class="card-glow"></div>
					<div class="card-header-bar">
						<span class="feature-badge">Reasoning</span>
						<h3>การแสดงกระบวนการคิดวิเคราะห์ (Reasoning & Deep Thinking)</h3>
					</div>
					<p>สำหรับโมเดลระดับสูงที่มีความสามารถในการคิดวิเคราะห์ (เช่น DeepSeek-R1):</p>
					<ul>
						<li><strong> Collapsible Thoughts:</strong> แสดงกระบวนการคิดในกล่องรายละเอียดที่ซ่อนได้แบบอัตโนมัติ เพื่อไม่ให้หน้าต่างแชทรกเกินไป</li>
						<li><strong>Thinking Right Pane:</strong> กดปุ่มเปิดดูขั้นตอนการคิดวิเคราะห์แยกเฉพาะในบานหน้าต่างขวาสุดแบบ Real-time เพื่อประเมินความสมเหตุสมผลของข้อสรุปจาก AI</li>
					</ul>
				</div>

				<!-- Feature 5 -->
				<div class="feature-item-card">
					<div class="card-glow"></div>
					<div class="card-header-bar">
						<span class="feature-badge">Memory</span>
						<h3>บันทึกข้อมูลหลัก & ระบบจำประเด็นสำคัญ (AI Memory)</h3>
					</div>
					<p>แก้ไขปัญหาที่ AI มักจะลืมข้อมูลสำคัญเมื่อสลับบทสนทนาหรือเมื่อเนื้อหายาวเกินไป:</p>
					<ul>
						<li><strong>Remember Message:</strong> สามารถเลือกสั่งให้ AI บันทึกข้อสรุป ประเด็นตัดสินใจ หรือคีย์ข้อมูลที่ถูกต้องเอาไว้ในฐานข้อมูลประวัติหน่วยความจำถาวรได้ทันที</li>
						<li><strong>สืบค้นง่าย:</strong> ข้อความสำคัญจะถูกเก็บไว้อย่างถาวรในคอมพิวเตอร์ของคุณเพื่อการอ้างอิงข้ามการสนทนาในภายหลัง</li>
					</ul>
				</div>

				<!-- Feature 6 -->
				<div class="feature-item-card">
					<div class="card-glow"></div>
					<div class="card-header-bar">
						<span class="feature-badge">Output</span>
						<h3>บานหน้าต่างแก้ไขผลลัพธ์ (Canvas Panel & Exports)</h3>
					</div>
					<p>สะดวกสบายในการส่งมอบงานและใช้งานเนื้อหาที่ถูกผลิตขึ้นจากระบบ AI:</p>
					<ul>
						<li><strong>Canvas View:</strong> เปิดไฟล์โค้ดหรือเอกสารที่ AI ช่วยสร้างแยกไว้ในฝั่งขวา เพื่อให้อ่านและคัดลอกได้ง่ายโดยไม่ต้องเลื่อนหาในแชท</li>
						<li><strong>การส่งออกหลากหลาย:</strong> รองรับการดาวน์โหลดไฟล์บทสนทนาเป็น PDF และ Markdown (.md) คุณภาพสูง จัดหน้าสวยงามเรียบร้อย</li>
					</ul>
				</div>
			</div>
		</section>

		<!-- Section: Usage Guide -->
		<section class="guide-section animate-fade-in">
			<div class="section-header">
				<h2>📖 แนะนำคู่มือการใช้งานเบื้องต้น (Quick Start Guide)</h2>
				<p>ขั้นตอนง่ายๆ ในการตั้งค่าและปลดล็อกการใช้งานอย่างเต็มประสิทธิภาพ</p>
			</div>

			<div class="guide-timeline">
				<div class="timeline-item">
					<div class="timeline-number">1</div>
					<div class="timeline-content">
						<h3>การเชื่อมต่อโมเดลเข้ากับระบบ</h3>
						<p>กดที่ปุ่ม <strong>Settings</strong> บริเวณมุมซ้ายล่างสุดของแถบข้าง (Sidebar) จากนั้นตั้งค่าเลือกผู้ให้บริการโมเดลที่คุณต้องการ:</p>
						<ul>
							<li>หากรัน Ollama ในเครื่อง ให้ตรวจสอบว่า Ollama ทำงานอยู่ แล้วใส่ URL: <code>http://127.0.0.1:11434</code></li>
							<li>หากใช้งานคลาวด์หรือ Google Gemini ให้ระบุ API Key ของตนเอง ระบบจะทำการดึงรายชื่อโมเดลขึ้นมาแสดงที่แถบเลือกโมเดลด้านล่างทันที</li>
						</ul>
					</div>
				</div>

				<div class="timeline-item">
					<div class="timeline-number">2</div>
					<div class="timeline-content">
						<h3>การสร้างโปรเจกต์และแนบไฟล์</h3>
						<p>ที่แถบข้างโปรเจกต์ (Sidebar) กดเครื่องหมาย <strong>โฟลเดอร์ (+)</strong> เพื่อสร้างโปรเจกต์ใหม่:</p>
						<ul>
							<li>ระบุคำสั่ง System Context เช่น แนวการทำงาน สไตล์การเขียนโค้ดที่โมเดลต้องยึดถือ</li>
							<li>กดปุ่ม <strong>Attach Reference File</strong> เพื่อแนบโค้ดหรือข้อมูลหลัก จากนั้นบันทึก</li>
							<li>เริ่มคุยในห้องแชทของโปรเจกต์นั้น ๆ AI จะได้รับเนื้อหาของไฟล์ทั้งหมดไปอ้างอิงทันที</li>
						</ul>
					</div>
				</div>

				<div class="timeline-item">
					<div class="timeline-number">3</div>
					<div class="timeline-content">
						<h3>การใช้กล่องช่วยคิดและ Canvas</h3>
						<p>เมื่อเริ่มต้นแชท หากคุณใช้งานโมเดลอย่าง DeepSeek-R1 และมีการใช้งานเชิงลึก:</p>
						<ul>
							<li>กล่องความคิดวิเคราะห์จะแสดงอยู่ใต้ชื่อผู้ใช้ หากต้องการดูแบบกว้างขวาง ให้คลิกปุ่ม <strong>View in Right Pane ↗</strong> เพื่อเปิดแถบข้างขวา</li>
							<li>สลับเป็นโหมด <strong>Canvas</strong> บนบานหน้าต่างขวาเพื่อใช้สร้างหรือแก้ไขเอกสารยาว ๆ ได้โดยที่บทสนทนายังคงลื่นไหล</li>
						</ul>
					</div>
				</div>
			</div>
		</section>

		<!-- Section: Future Plans -->
		<section class="future-section animate-fade-in">
			<div class="future-card">
				<div class="future-badge">Coming Soon</div>
				<h2>🚀 แผนพัฒนาในอนาคต (Roadmap)</h2>
				<p>ระบบ Order AI จะยังคงปรับปรุงความสามารถอย่างต่อเนื่องเพื่อให้เหมาะกับการทำงานระดับมืออาชีพ โดยมีแผนพัฒนาดังนี้:</p>
				<div class="roadmap-grid">
					<div class="roadmap-item">
						<h4>📂 เพิ่มไฟล์ขนาดใหญ่ (Vector Search RAG)</h4>
						<p>ระบบค้นหาข้อมูลจากคลังเอกสารแนบขนาดใหญ่และ PDF หลายร้อยหน้าโดยอัตโนมัติผ่าน Vector DB</p>
					</div>
					<div class="roadmap-item">
						<h4>🤝 ระบบตัวแทนผู้ช่วยหลายบทบาท (Multi-Agent Setup)</h4>
						<p>ให้โมเดลจำลองคุยประสานงานกันเองหลายบทบาทเพื่อผลิตผลงานที่ซับซ้อนตามเงื่อนไขที่ผู้ใช้ระบุ</p>
					</div>
					<div class="roadmap-item">
						<h4>📊 แดชบอร์ดสรุปการคำนวณและสถิติ</h4>
						<p>แสดงรายละเอียดการใช้งานโทเค็น ประสิทธิภาพความเร็วของแต่ละโมเดลที่เชื่อมต่อ และสถิติเชิงลึก</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Footer Button -->
		<div class="footer-action animate-fade-in">
			<a href="/" class="primary-btn" id="features-primary-back-btn">
				<svg viewBox="0 0 24 24" width="20" height="20">
					<path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
				</svg>
				<span>เริ่มใช้งานเลย (Go to Workspace)</span>
			</a>
		</div>
	</main>
</div>

<style>
	/* Page Layout Styling using variables in app.css */
	.features-page {
		height: 100vh;
		max-height: 100vh;
		background-color: var(--bg-primary);
		color: var(--text-primary);
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
		overflow-y: auto;
	}

	.container {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0 24px;
		width: 100%;
		box-sizing: border-box;
	}

	/* Header styles */
	.page-header {
		background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
		border-bottom: 1px solid var(--border-light);
		padding: 32px 0 48px 0;
	}

	.header-container {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0 24px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 0.9rem;
		font-weight: 500;
		padding: 8px 16px;
		border-radius: 99px;
		border: 1px solid var(--border-color);
		background-color: var(--bg-secondary);
		width: fit-content;
		transition: all var(--transition-fast);
	}

	.back-btn:hover {
		color: var(--text-primary);
		border-color: var(--accent-blue);
		background-color: var(--bg-hover);
		transform: translateX(-2px);
	}

	.logo-badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: rgba(168, 199, 250, 0.08);
		border: 1px solid rgba(168, 199, 250, 0.16);
		color: var(--accent-blue);
		padding: 6px 14px;
		border-radius: 99px;
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 1px;
		margin-bottom: 16px;
	}

	.logo-icon {
		filter: drop-shadow(0 0 4px rgba(168, 199, 250, 0.4));
	}

	.header-main h1 {
		font-family: var(--font-title);
		font-size: 2.75rem;
		font-weight: 700;
		margin: 0 0 12px 0;
		letter-spacing: -0.5px;
		background: linear-gradient(135deg, var(--text-primary) 30%, var(--accent-blue) 100%);
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.subtitle {
		font-size: 1.15rem;
		color: var(--text-secondary);
		margin: 0;
		max-width: 700px;
		line-height: 1.5;
	}

	/* Content Sections */
	.page-content {
		padding-top: 48px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 80px;
	}

	.section-header {
		margin-bottom: 36px;
	}

	.section-header h2 {
		font-family: var(--font-title);
		font-size: 1.75rem;
		font-weight: 600;
		margin: 0 0 8px 0;
		color: var(--text-primary);
	}

	.section-header p {
		font-size: 1rem;
		color: var(--text-muted);
		margin: 0;
	}

	/* Highlights Grid */
	.highlights-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 24px;
	}

	.highlight-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 28px;
		transition: all var(--transition-normal);
		position: relative;
		overflow: hidden;
	}

	.highlight-card:hover {
		transform: translateY(-4px);
		border-color: var(--accent-blue);
		box-shadow: var(--shadow-lg), 0 10px 30px rgba(0, 0, 0, 0.2);
	}

	.card-icon {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 20px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--text-muted);
		transition: all var(--transition-normal);
	}

	.highlight-card:hover .card-icon {
		color: var(--accent-blue);
		background: rgba(168, 199, 250, 0.1);
	}

	.highlight-card h3 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 12px 0;
		color: var(--text-primary);
	}

	.highlight-card p {
		font-size: 0.95rem;
		color: var(--text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	/* Core Features Section */
	.features-list-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
		gap: 24px;
	}

	@media (max-width: 768px) {
		.features-list-grid {
			grid-template-columns: 1fr;
		}
	}

	.feature-item-card {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 32px;
		position: relative;
		overflow: hidden;
		transition: all var(--transition-normal);
	}

	.feature-item-card:hover {
		border-color: rgba(168, 199, 250, 0.35);
		box-shadow: var(--shadow-md);
	}

	.card-glow {
		position: absolute;
		top: 0;
		right: 0;
		width: 120px;
		height: 120px;
		background: radial-gradient(circle, rgba(168, 199, 250, 0.08) 0%, rgba(0, 0, 0, 0) 70%);
		pointer-events: none;
	}

	.card-header-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}

	.feature-badge {
		font-size: 0.75rem;
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.5px;
		color: var(--accent-blue);
		background: rgba(168, 199, 250, 0.1);
		padding: 4px 10px;
		border-radius: 6px;
	}

	.feature-item-card h3 {
		font-size: 1.3rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-primary);
	}

	.feature-item-card p {
		font-size: 0.95rem;
		color: var(--text-secondary);
		line-height: 1.6;
		margin: 0 0 16px 0;
	}

	.feature-item-card ul {
		margin: 0;
		padding-left: 20px;
		color: var(--text-secondary);
		font-size: 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 8px;
		line-height: 1.5;
	}

	.feature-item-card strong {
		color: var(--text-primary);
	}

	/* Guide Timeline Section */
	.guide-timeline {
		display: flex;
		flex-direction: column;
		gap: 32px;
		position: relative;
		margin-top: 16px;
	}

	.guide-timeline::before {
		content: '';
		position: absolute;
		left: 28px;
		top: 16px;
		bottom: 16px;
		width: 2px;
		background-color: var(--border-color);
	}

	.timeline-item {
		display: flex;
		gap: 24px;
		position: relative;
	}

	.timeline-number {
		width: 56px;
		height: 56px;
		min-width: 56px;
		border-radius: 50%;
		background-color: var(--bg-tertiary);
		border: 2px solid var(--border-color);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--accent-blue);
		z-index: 2;
		box-shadow: var(--shadow-sm);
	}

	.timeline-content {
		background-color: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 24px 28px;
		flex: 1;
	}

	.timeline-content h3 {
		font-size: 1.15rem;
		font-weight: 600;
		margin: 0 0 10px 0;
		color: var(--text-primary);
	}

	.timeline-content p {
		font-size: 0.95rem;
		color: var(--text-secondary);
		line-height: 1.6;
		margin: 0 0 12px 0;
	}

	.timeline-content ul {
		margin: 0;
		padding-left: 20px;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.95rem;
	}

	.timeline-content code {
		background-color: var(--bg-primary);
		border: 1px solid var(--border-color);
		padding: 2px 6px;
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--accent-blue);
	}

	/* Roadmap Section */
	.future-card {
		background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(168, 199, 250, 0.03) 100%);
		border: 1px solid var(--border-color);
		border-radius: 20px;
		padding: 40px;
		position: relative;
		overflow: hidden;
	}

	.future-badge {
		display: inline-block;
		background-color: #f59e0b;
		color: #1e1b4b;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		padding: 4px 10px;
		border-radius: 6px;
		margin-bottom: 16px;
	}

	.future-card h2 {
		font-family: var(--font-title);
		font-size: 1.75rem;
		font-weight: 600;
		margin: 0 0 12px 0;
		color: var(--text-primary);
	}

	.future-card > p {
		font-size: 1.05rem;
		color: var(--text-secondary);
		margin: 0 0 32px 0;
		line-height: 1.6;
		max-width: 800px;
	}

	.roadmap-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 24px;
		border-top: 1px solid var(--border-color);
		padding-top: 32px;
	}

	.roadmap-item h4 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 8px 0;
		color: var(--text-primary);
	}

	.roadmap-item p {
		font-size: 0.9rem;
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0;
	}

	/* Footer Action */
	.footer-action {
		display: flex;
		justify-content: center;
		margin-top: 16px;
	}

	.primary-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background-color: var(--accent-blue);
		color: var(--accent-text);
		font-size: 1.05rem;
		font-weight: 600;
		padding: 14px 32px;
		border-radius: 99px;
		text-decoration: none;
		box-shadow: 0 4px 14px rgba(168, 199, 250, 0.3);
		transition: all var(--transition-normal);
	}

	.primary-btn:hover {
		background-color: var(--accent-blue-hover);
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(168, 199, 250, 0.4);
	}

	/* Micro animations */
	.animate-fade-in {
		animation: fadeIn 0.6s ease-out forwards;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
