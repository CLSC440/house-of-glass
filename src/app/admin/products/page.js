'use client';
import { useGallery } from '@/contexts/GalleryContext';
import { useState } from 'react';
import AdminProductModal from '@/components/admin/AdminProductModal';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

export default function AdminProducts() {
    const { allProducts, categories, isLoading } = useGallery();
    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    const filtered = allProducts.filter(p => !search || (p.name || p.title || '').toLowerCase().includes(search.toLowerCase()));

    const handleEdit = (product) => {
        setEditingProduct(product);
        setModalOpen(true);
    };

    const handleAdd = () => {
        setEditingProduct(null);
        setModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this product?')) {
            try {
                await deleteDoc(doc(db, 'products', id));
            } catch (err) {
                console.error(err);
                alert('Failed to delete product');
            }
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-brandBlue dark:text-brandGold">Products Data</h1>
                    <p className="text-gray-500 mt-1">Manage your gallery products directly</p>
                </div>
                <button onClick={handleAdd} className="px-4 py-2 bg-brandGold text-white font-bold rounded-xl hover:opacity-90 shadow-sm transition-all flex items-center gap-2">
                    <i className="fa-solid fa-plus"></i> Add Product
                </button>
            </header>

            <div className="bg-white dark:bg-darkCard rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 md:p-6">
                <div className="mb-6 flex gap-4 w-full md:w-96">
                    <div className="relative flex-1">
                        <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="text"
                            placeholder="Search by name..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-brandGold outline-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 uppercase font-bold text-xs">
                            <tr>
                                <th className="px-4 py-3 rounded-l-xl">Image</th>
                                <th className="px-4 py-3">Code</th>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3">Price</th>
                                <th className="px-4 py-3 rounded-r-xl">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-gray-400">Loading data from Firebase...</td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-gray-400">No products found.</td>
                                </tr>
                            ) : (
                                filtered.map(product => (
                                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="px-4 py-3">
                                            {product.images && product.images.length > 0 ? (
                                                <img src={product.images[0].url || product.images[0]} className="w-12 h-12 rounded-lg object-cover" />
                                            ) : (
                                                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-400">
                                                    <i className="fa-solid fa-image"></i>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">{product.code || '-'}</td>
                                        <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{product.name || product.title}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 bg-brandGold/10 text-brandGold rounded-full text-xs font-bold">{product.category || 'General'}</span>
                                        </td>
                                        <td className="px-4 py-3 font-mono">{product.price || '-'} AED</td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => handleEdit(product)} className="text-gray-400 hover:text-brandGold transition-colors p-2">
                                                <i className="fa-solid fa-pen"></i>
                                            </button>
                                            <button onClick={() => handleDelete(product.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 ml-2">
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <AdminProductModal 
                isOpen={modalOpen} 
                onClose={() => setModalOpen(false)} 
                product={editingProduct} 
                categories={categories} 
            />
        </div>
    );
}
