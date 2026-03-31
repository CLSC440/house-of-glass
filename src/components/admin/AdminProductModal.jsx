'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

export default function AdminProductModal({ isOpen, onClose, product, categories }) {
    const [formData, setFormData] = useState({
        name: '', code: '', barcode: '', category: 'All', brand: '',
        origin: '', price: '', desc: '', images: [], variants: [], stockStatus: 'in_stock'
    });
    const [imageInput, setImageInput] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (product) {
            setFormData({
                name: product.name || product.title || '',
                code: product.code || '',
                barcode: product.barcode || '',
                category: product.category || 'All',
                brand: product.brand || '',
                origin: product.origin || '',
                price: product.price || '',
                desc: product.desc || product.description || '',
                images: product.images || [],
                variants: product.variants || [],
                stockStatus: product.stockStatus || 'in_stock'
            });
        } else {
            setFormData({ name: '', code: '', barcode: '', category: 'All', brand: '', origin: '', price: '', desc: '', images: [], variants: [], stockStatus: 'in_stock' });
        }
    }, [product, isOpen]);

    if (!isOpen) return null;

    const handleAddImage = () => {
        if (imageInput.trim()) {
            setFormData(prev => ({ ...prev, images: [...prev.images, { url: imageInput, type: 'image' }] }));
            setImageInput('');
        }
    };

    const handleRemoveImage = (index) => {
        setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const productData = { ...formData, updatedAt: serverTimestamp() };
            if (!product) productData.createdAt = serverTimestamp();
            
            if (product && product.id) {
                await setDoc(doc(db, 'products', product.id), productData, { merge: true });
            } else {
                await addDoc(collection(db, 'products'), productData);
            }
            onClose();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Failed to save product');
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-4xl bg-white dark:bg-darkCard rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        {product ? 'Edit Product' : 'Add New Product'}
                    </h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/50 dark:bg-gray-900/20">
                    <form id="productForm" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Product Name *</label>
                                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-brandGold" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Product Code</label>
                                <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-brandGold" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Category</label>
                                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-brandGold">
                                    <option value="All">All Categories</option>
                                    {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Price (AED)</label>
                                <input type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-brandGold" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Images (URLs)</label>
                            <div className="flex gap-2 mb-4">
                                <input type="text" placeholder="https://..." value={imageInput} onChange={e => setImageInput(e.target.value)} className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-brandGold" />
                                <button type="button" onClick={handleAddImage} className="px-6 py-3 bg-brandBlue dark:bg-gray-700 text-white rounded-xl hover:opacity-90 transition-opacity font-bold">Add</button>
                            </div>
                            {formData.images.length > 0 && (
                                <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
                                    {formData.images.map((img, idx) => (
                                        <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 group">
                                            <img src={img.url || img} className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => handleRemoveImage(idx)} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                                <i className="fa-solid fa-xmark text-xs"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Description</label>
                            <textarea rows="4" value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-brandGold"></textarea>
                        </div>
                    </form>
                </div>
                
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 rounded-b-3xl bg-white dark:bg-darkCard">
                    <button onClick={onClose} type="button" className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-bold transition-colors">Cancel</button>
                    <button onClick={handleSubmit} disabled={loading} type="button" className="px-8 py-2.5 rounded-xl bg-brandGold text-white font-bold hover:opacity-90 shadow-sm transition-all disabled:opacity-50">
                        {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Save Product'}
                    </button>
                </div>
            </div>
        </div>
    );
}
