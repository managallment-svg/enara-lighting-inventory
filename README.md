# إدارة مخازن إنارة

تطبيق لإدارة المخازن والحركات المخزنية بواجهة عربية تدعم:

- نسخة ويب تعمل في المتصفح
- `PWA` قابلة للتثبيت على الهاتف
- Android عبر `Capacitor`
- Windows عبر `Tauri`

## المتطلبات

- `Node.js 20+`
- `npm`
- `Java 17+` و Android SDK عند بناء نسخة Android
- Rust عند بناء نسخة Windows عبر `Tauri`

## التشغيل محليًا

1. تثبيت الحزم:
   ```bash
   npm install
   ```
2. تشغيل نسخة الويب:
   ```bash
   npm run dev
   ```

## أوامر البناء

```bash
npm run build:web
npm run preview
npm run android:prepare
npm run android:debug
npm run tauri:build
```

## النشر على GitHub Pages

المشروع يحتوي بالفعل على workflow جاهز داخل:

`/.github/workflows/deploy-pages.yml`

بعد رفع المشروع إلى GitHub:

1. فعّل `GitHub Pages` من إعدادات المستودع باستخدام `GitHub Actions`.
2. ارفع الكود إلى فرع `main`.
3. سيقوم GitHub ببناء نسخة الويب ونشرها تلقائيًا.

## فتح التطبيق على iPhone

- افتح رابط GitHub Pages من Safari.
- اختر `مشاركة` ثم `إضافة إلى الشاشة الرئيسية`.
- سيعمل التطبيق كتطبيق `PWA` بواجهة مستقلة.

## ملاحظات مهمة

- إذا كنت تستخدم Firebase Authentication، أضف دومين GitHub Pages إلى `Authorized Domains`.
- ملفات المشروع العربية يجب أن تبقى بترميز `UTF-8` لتفادي تشوه النصوص.
- أيقونات التطبيق موجودة داخل `public/` وتم ربطها مع `PWA` ونسخ Android وWindows.
