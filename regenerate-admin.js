const fs = require('fs');
const path = require('path');

function processHtml(fileName) {
    const originalHtmlPath = path.join(__dirname, '..', 'Gallary Website', `${fileName}.html`);
    const nextJsPath = path.join(__dirname, 'src', 'app', fileName, 'page.js');
    
    let html = fs.readFileSync(originalHtmlPath, 'utf8');

    // Remove CDN scripts that we don't need inline (Tailwind, React if any, etc)
    html = html.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/g, '');
    html = html.replace(/<script src="locales-data\.js"><\/script>/g, '');
    html = html.replace(/<script src="i18n\.js"><\/script>/g, '');
    html = html.replace(/<script[\s\S]*?Sortable\.min\.js"><\/script>/g, '');
    
    // Remove tailwind config but preserve the rest of that script block!
    html = html.replace(/tailwind\.config\s*=\s*\{[\s\S]*?\/\/\s*---\s*Smart Theme Logic\s*---/, '// --- Smart Theme Logic ---');

    // Extract all remaining script tags
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptsContent = [];
    let match;
    let modifiedHtml = html;

    while ((match = scriptRegex.exec(html)) !== null) {
        if (match[1].trim()) {
            scriptsContent.push(match[1]);
        }
        modifiedHtml = modifiedHtml.replace(match[0], '');
    }

    // Extract the body content
    const bodyMatch = modifiedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyContent = bodyMatch ? bodyMatch[1] : modifiedHtml;

    // Handle string escaping for React dangerouslySetInnerHTML
    bodyContent = bodyContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    // Combine scripts
    let combinedScripts = scriptsContent.join('\n\n');
    
    // Replace const with var to avoid let/const redeclaration on hot reloads
    combinedScripts = combinedScripts.replace(/\bconst\b/g, 'var');

    // Fix imports for Next.js format (e.g. ./account-api.js -> /account-api.js)
    combinedScripts = combinedScripts.replace(/['"]\.\/account-api\.js['"]/g, "'/account-api.js'");

    // Build the page component
    const reactComponent = `
'use client';
import { useEffect } from 'react';

export default function Page() {
    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'module';
        // We use backticks to retain multi-line template literals, but we have to escape 
        // internal template literals in the script if they use backticks. Or use String.raw?
        // Let's use a safe method: assign via string parts or just escape backticks in the script content
        script.innerHTML = \`${combinedScripts.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
        
        document.body.appendChild(script);
        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []);

    return (
        <div className="flex-1 flex flex-col w-full" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: \`${bodyContent}\` }} />
    );
}
    `.trim();

    fs.writeFileSync(nextJsPath, reactComponent, 'utf8');
    console.log(`Successfully regenerated ${fileName}.`);
}

processHtml('admin');
processHtml('admin-stock');
