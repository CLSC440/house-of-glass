const fs = require('fs');

let target = fs.readFileSync('src/app/admin/page.js', 'utf8');

// I am adding a try/catch to help trace exactly WHY the page script stops loading the products.
target = target.replace(/import \{ initializeApp \} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.8\.0\/firebase-app\.js";/, 
`import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";\nwindow.addEventListener("error", (event) => console.error("Global JS Exception:", event.message));`);

fs.writeFileSync('src/app/admin/page.js', target);
