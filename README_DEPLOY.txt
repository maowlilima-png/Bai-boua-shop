Bai Boua Shop - GitHub Pages Ready

วิธีอัปโหลดให้หน้าเว็บขึ้นจริง:
1) แตกไฟล์ ZIP นี้
2) เอาไฟล์ทั้งหมดด้านในโฟลเดอร์ BaiBoua_github_pages_ready ไปวางไว้ที่ root ของ GitHub repository
   สำคัญ: ต้องมีไฟล์ index.html อยู่หน้าแรกของ repo ไม่ใช่อยู่ในโฟลเดอร์ latest หรือ database
3) ไปที่ GitHub > Settings > Pages
4) Source: Deploy from a branch
5) Branch: main / root แล้วกด Save
6) รอ 1-3 นาที แล้วเปิดลิงก์ GitHub Pages ใหม่

ไฟล์หลักของเว็บคือ: index.html
ไฟล์ SQL สำหรับ Supabase อยู่ที่: database/BaiBoua_supabase_setup.sql

ถ้ายังเห็นหน้า README หรือชื่อ repo แปลว่า index.html ยังไม่ได้อยู่ที่ root ของ repo หรือ Pages ยังไม่ได้ deploy ใหม่
