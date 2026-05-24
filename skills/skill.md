# Svelte 5 Development Skills & Guidelines

เอกสารนี้รวบรวมรูปแบบ (Patterns), แนวทาง (Guidelines), และข้อควรระวัง (Gotchas) เพื่อใช้เป็นแนวทางในการพัฒนาและป้องกันข้อผิดพลาดซ้ำซ้อนในโปรเจกต์ Svelte 5

## 1. Svelte 5 Runes Patterns

### การเลือกใช้ Runes
- **$state**: ใช้สำหรับข้อมูลพื้นฐานที่ต้องการให้ UI อัปเดต (Reactive State)
- **$derived**: ใช้สำหรับข้อมูลที่คำนวณจาก state อื่นเสมอ (แทนการใช้ `$effect` เพื่ออัปเดต state อื่น)
- **$derived.by**: ใช้สำหรับ Logic การคำนวณที่ซับซ้อนหรือมีหลายบรรทัด
- **$effect**: ใช้สำหรับ side-effects ภายนอกเท่านั้น เช่น DOM API, LocalStorage, หรือ Third-party libraries
- **$props**: ใช้ในการรับค่าจาก Parent เสมอ โดยสามารถใช้ Destructuring ได้

### ข้อควรระวัง $state
- **Deep Reactivity**: `$state` ทำงานแบบ Proxy ลึกถึง Object/Array ภายใน
- **$state.raw**: หากมี Array ขนาดใหญ่ที่ต้องการเปลี่ยนค่าแบบยกชุด (Reassign) และไม่ต้องการความละเอียดในการตรวจจับการเปลี่ยนแปลงภายใน (Mutation) ให้ใช้ `$state.raw` เพื่อประสิทธิภาพสูงสุด

---

## 2. การจัดการสถานะ (State Management)

### Global State vs Component State
- แยก Logic ที่ต้องใช้ร่วมกันไว้ใน `src/lib/*.svelte.ts` โดยใช้ class เพื่อความเป็นระเบียบ
- **Persistence**: หากต้องการบันทึกสถานะลง `localStorage` ให้ใช้ `$effect` ภายใน `initialize()` method (หลีกเลี่ยงการใส่ใน constructor เพื่อป้องกัน `effect_orphan` error ระหว่าง SSR)

### Derived Over Effect
- **Mantra**: "Don't use `$effect` to sync state."
- หากต้องการค่า B ที่เปลี่ยนตาม A ให้ใช้ `B = $derived(A * 2)` เสมอ อย่าใช้ `$effect(() => { B = A * 2 })`

---

## 3. UI & Styling (Vanilla CSS + Tailwind)

### ประสิทธิภาพของ UI
- **Micro-animations**: ใช้ CSS transitions/animations สำหรับ Hover effects และการเปลี่ยนสถานะ
- **Dark Mode**: ใช้ class `dark` ที่ `document.documentElement` และเขียน style รองรับทั้งสองโหมด
- **Font Support**: โปรเจกต์นี้รองรับภาษาไทยเป็นหลัก ควรใช้ฟอนต์อย่าง Sarabun, Kanit, หรือ Prompt เป็นค่าเริ่มต้น

### Layout Stability
- ระวังเรื่อง Layout Shift เมื่อมีการแสดงผลข้อมูลขนาดใหญ่ หรือการสลับหน้า (Split-pane)
- กำหนดขนาดขั้นต่ำ (min-height/min-width) ให้กับ Container ที่มีการโหลดข้อมูลแบบ Dynamic

---

## 4. Animation & Transitions

### การใช้ Transitions
- **Svelte Transitions**: ใช้ `transition:fade`, `transition:slide` หรือ `in:`, `out:` สำหรับการแสดงผล/ซ่อน Element
- **Gradual Reveal**: สำหรับลิสต์ที่มีการเพิ่มข้อมูล (เช่น Randomizer results) ให้ใช้การขยายแบบค่อยเป็นค่อยไป (Gradual Expansion) แทนการเด้งขึ้นมาทันที

### Animation Performance
- ใช้ `transform` และ `opacity` ในการทำ animation เป็นหลักเพื่อรักษา 60fps
- **Rolling Numbers**: สำหรับการทำตัวเลขวิ่ง (Randomizer) ให้จำลองการสุ่มแบบทีละหลัก (per-digit) เพื่อความสมจริง

---

## 5. ข้อควรระวังเพื่อป้องกันข้อผิดพลาดซ้ำ (Common Mistakes)

### SSR Errors
- **Window is not defined**: ตรวจสอบ `if (typeof window !== 'undefined')` ก่อนเข้าถึง browser APIs เสมอ
- **OnMount Replacement**: ใน Svelte 5, `$effect` จะรันเฉพาะฝั่ง Client เท่านั้น (ทำหน้าที่คล้าย `onMount`)

### Reactivity Lost
- **Destructuring State**: การ destructuring ค่าจาก `$state` จะทำให้เสียความเป็น reactive (ยกเว้นกรณีใช้ `$props` หรือการ destructuring ภายใน `$derived`)
- **Passing State**: หากต้องการส่ง state เข้าไปใน function แล้วอยากให้ function นั้นเห็นค่าล่าสุดเสมอ ให้ส่งเป็น getter function `() => state` แทนการส่งตัวแปรตรงๆ

### Linting & Types
- รักษาความสะอาดของโค้ด (Lint-free) เสมอ
- ระบุ Type ให้กับ `$state<T>(...)` เมื่อใช้กับ Array หรือ Object ที่ซับซ้อน

### Specific Project Gotchas
- **Month Boundary**: ในโมดูล Planner ระวังเรื่องการคำนวณวันที่ข้ามเดือน (Data integrity during month-boundary transitions)
- **Today Label**: หลีกเลี่ยงการใช้ Label ที่ซ้ำซ้อน เช่น 'TODAY' ในหน้าปฏิทินหากมีสีเน้นบอกอยู่แล้ว
- **Effect Orphan**: อย่าประกาศ `$effect` ใน constructor ของ class ให้ประกาศใน method ที่ถูกเรียกจาก component แทน

---

## 6. การตรวจสอบก่อน Commit (Checklist)
- [ ] มีการใช้ `$effect` เพื่ออัปเดต state ตัวอื่นหรือไม่? (ถ้ามี ให้เปลี่ยนเป็น `$derived`)
- [ ] มีการเข้าถึง Browser API โดยไม่ได้เช็ค `window` หรือไม่?
- [ ] ตัวแปรที่ส่งข้ามไฟล์สามารถ Reassign ได้หรือไม่? (ควรส่งเป็น Object หรือใช้ Getter/Setter)
- [ ] UI รองรับทั้ง Light/Dark mode และ Responsive หรือยัง?
- [ ] ฟอนต์ภาษาไทยแสดงผลถูกต้องหรือไม่?

---

## 7. Versioning & Deployment Guidelines

### เมื่อมีการอัปเดตเวอร์ชัน (Update Version)
- **package.json**: อัปเดตฟิลด์ `version` ให้สอดคล้อง (Major.Minor.Patch)
- **What's New Page**: เพิ่มส่วนข้อมูลล่าสุดที่ด้านบนสุดของไฟล์ `src/routes/help/whats-new/+page.svelte` โดยใช้โครงสร้างดีไซน์เดิมและระบุฟีเจอร์สำคัญ
- **Global Search**: ค้นหาเลขเวอร์ชันเก่า (เช่น `2.5.0`) ทั่วทั้งโปรเจกต์ เพื่อเปลี่ยนเป็นเวอร์ชันใหม่ในจุดต่างๆ (Footer, Sidebar, App Menu) ให้เป็นปัจจุบันที่สุด
- **Skill.md**: อัปเดตแนวทางหรือเทคนิคใหม่ๆ ที่ได้จากการพัฒนาในเวอร์ชันนั้นๆ เพื่อป้องกันข้อผิดพลาดซ้ำ

### ขั้นตอนเตรียม Deploy
1. **Lint & Check**: รัน `bun lint` และ `bun check` เพื่อตรวจสอบความเรียบร้อยของโค้ดและ Type Safety
2. **Build Test**: รัน `bun build` เพื่อตรวจสอบว่าโปรเจกต์สามารถ Build ผ่านได้จริงโดยไม่มีปัญหา SSR หรือไฟล์ที่หายไป
3. **Database Schema**: หากมีการเปลี่ยนโครงสร้าง DB (Dexie) ให้ตรวจสอบการอัปเดตเลขเวอร์ชันในไฟล์ DB config และจัดการ upgrade logic ให้เรียบร้อย
4. **Final Visual Review**: ตรวจสอบการแสดงผลในทั้ง Light และ Dark mode รวมถึงความถูกต้องของตัวเลขเวอร์ชันในหน้าจอต่างๆ
