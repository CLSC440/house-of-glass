const fs = require('fs');
const file = 'src/components/admin/AdminProductModal.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    /type="number"\s+disabled\s+value=\{variant\.price\}\s+className="w-full cursor-not-allowed[^"]+"/g,
    \	ype="text"
                                                                      value={variant.price || ''}
                                                                      onChange={(e) => updateVariant(index, 'price', e.target.value)}
                                                                      className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50"\
);

content = content.replace(
    /type="number"\s+disabled\s+value=\{variant\.wholesalePrice\}\s+className="w-full cursor-not-allowed[^"]+"/g,
    \	ype="text"
                                                                      value={variant.wholesalePrice || ''}
                                                                      onChange={(e) => updateVariant(index, 'wholesalePrice', e.target.value)}
                                                                      className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50"\
);

content = content.replace(
    /type="number"\s+disabled\s+value=\{variant\.discountAmount\}\s+className="w-full cursor-not-allowed[^"]+"/g,
    \	ype="text"
                                                                      value={variant.discountAmount || ''}
                                                                      onChange={(e) => updateVariant(index, 'discountAmount', e.target.value)}
                                                                      className="w-full rounded-xl border border-white/10 bg-[#0f1728] px-3 py-2 text-sm text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-brandGold/50 focus:ring-1 focus:ring-brandGold/50"\
);

fs.writeFileSync(file, content);
