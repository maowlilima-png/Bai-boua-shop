BAI BOUA SHOP V38 - GitHub Pages + Supabase

สิ่งที่แก้ใน V38
1) แก้การเชื่อม Supabase app_state ให้ใช้ column `data` ตรงกับฐานข้อมูลเดิมของเว็บ
2) การ Save/Load และ Auto-sync ข้ามอุปกรณ์ใช้ app_state.id = main
3) รูปสินค้าจะอัปโหลดไป Supabase Storage bucket `product-images`
4) เก็บ localStorage เป็นสำรอง แต่ Cloud คือข้อมูลหลักเมื่อเชื่อมได้

ก่อนอัป GitHub
1) Supabase > SQL Editor
2) เปิดไฟล์ database/BaiBoua_supabase_v38_required.sql
3) Copy ทั้งหมดไป Run
4) ต้องขึ้น Success
5) จากนั้นอัปไฟล์เว็บไซต์ทั้งหมดขึ้น GitHub Pages ได้เลย

ไฟล์หลักที่ GitHub ต้องมีใน root:
- index.html
- app.js
- style.css
- assets/
- robots.txt
- sitemap.xml

หมายเหตุด้านความปลอดภัย
V38 เป็น static GitHub Pages และใช้ anon key จาก browser จึงต้องมี RLS policy ให้ anon เขียน app_state/Storage ได้เพื่อให้ระบบเดิมทำงานได้ ซึ่งเหมาะกับการใช้งาน prototype/ร้านส่วนตัว แต่ไม่ใช่รูปแบบที่ปลอดภัยที่สุดสำหรับเว็บสาธารณะ หากต้องการล็อก admin จริง ควรย้ายไป Supabase Auth ในรุ่นถัดไป
