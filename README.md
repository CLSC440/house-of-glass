# 💎 House of Glass - Al Ashour Ades Showroom

A premium, modern glassware gallery website designed for **Al Ashour Ades Showroom**. This project features a high-end product showcase with a dynamic management dashboard.

&nbsp;

## 🚀 Live Demo
**Visit the website:** [https://al-ashour-ades.netlify.app](https://al-ashour-ades.netlify.app)

&nbsp;

## ✨ Key Features
- **Modern UI/UX:** Styled with Tailwind CSS and premium typography (Cairo & Almarai).
- **Dynamic Database:** Powered by **Firebase Firestore** for real-time data syncing.
- **Admin Dashboard:** Secure area to add, edit, or delete products and categories.
- **Responsive Design:** Elegant viewing experience on mobiles, tablets, and desktops.
- **Advanced Sidebar:** Smart filtering system for product categories.

&nbsp;

## 🛠️ Tech Stack
- **Frontend:** HTML5, Tailwind CSS (CDN)
- **Backend/Database:** Firebase Firestore (v10 Modular SDK)
- **Icons:** FontAwesome
- **Deployment:** GitHub & Netlify (Continuous Deployment)

&nbsp;

## 🔐 Admin Access
To manage the gallery, navigate to `/login.html`:
- **URL:** `[your-domain]/login.html`
- **Username:** `****`
- **Password:** `*****`

&nbsp;

## ⚙️ How to Update
1. **Content Updates:** Simply log in to the admin panel on the live site to manage products.
2. **Code Updates:** 
   - Edit files in VS Code.
   - Run `git add .` -> `git commit -m "Update message"` -> `git push`.
   - The site will automatically redeploy via Netlify.

&nbsp;
<p align="center">
  <b>Developed with ❤️ for Al Ashour Ades Showroom</b><br>
  ال عاشور عدس - للفخامة عنوان
</p>

## How to Run
Since this is a static website, you can simply open `index.html` in any web browser.

Alternatively, you can serve it using Python:
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

## Customization
- To add more products, duplicate the "Gallery Item" blocks in `index.html`.
- Replace the placeholder image URLs with your own product photos.
- Modify the text descriptions to match your items.

## Custom Password Reset Email
- The branded reset email is sent by `api/password-reset-email.js`.
- Required environment variables:
  - `FIREBASE_SERVICE_ACCOUNT`
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM_EMAIL`
- Optional environment variables:
  - `SMTP_FROM_NAME`
  - `SMTP_SECURE`
  - `APP_BASE_URL`
- If the storefront is hosted on Firebase Hosting or Netlify, the frontend falls back to the Vercel API domain for this email route.
- On localhost preview, the site falls back to Firebase's default reset email if the API route is unavailable.

Example values:

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@your-domain.com
SMTP_PASS=your-mail-password
SMTP_FROM_EMAIL=no-reply@your-domain.com
SMTP_FROM_NAME=House Of Glass
APP_BASE_URL=https://your-domain.com
```
