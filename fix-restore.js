const fs = require('fs');

function restoreMissing(fileName, htmlName) {
    let html = fs.readFileSync('C:\\Users\\Mohamed\\Gallary Website\\' + htmlName, 'utf8');
    let pjs = fs.readFileSync('C:\\Users\\Mohamed\\Gallary NextJS\\src\\app\\' + fileName, 'utf8');

    // the missing chunk starts after <script> tailwind.config and ends at firebaseConfig };
    // BUT wait, tailwind.config was a separate script block originally in <head>. 
    // And some other code got matched!
    console.log('Restoring for ' + fileName);
}
restoreMissing('admin/page.js', 'admin.html');
