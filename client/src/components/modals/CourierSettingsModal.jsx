import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Save, Loader2, Plus, Trash2, Edit2, Truck } from 'lucide-react';
import { toast } from 'react-toastify';

const CourierSettingsModal = ({ isOpen, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [couriers, setCouriers] = useState([]);
  
  // Form State
  const [editingIndex, setEditingIndex] = useState(-1);
  const [formData, setFormData] = useState({ name: '', trackingUrlBase: '' });

  useEffect(() => {
    if (isOpen) fetchCouriers();
  }, [isOpen]);

  const fetchCouriers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/courier-config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCouriers(response.data.couriers || []);
    } catch (error) {
      toast.error("Failed to load couriers.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrUpdate = () => {
    if (!formData.name.trim()) return toast.warning("Courier Name is required");

    const newCouriers = [...couriers];
    if (editingIndex >= 0) {
      newCouriers[editingIndex] = { ...formData, active: true };
    } else {
      newCouriers.push({ ...formData, active: true });
    }
    
    setCouriers(newCouriers);
    setFormData({ name: '', trackingUrlBase: '' });
    setEditingIndex(-1);
  };

  const handleEdit = (index) => {
    setFormData(couriers[index]);
    setEditingIndex(index);
  };

  const handleDelete = (index) => {
    const newCouriers = couriers.filter((_, i) => i !== index);
    setCouriers(newCouriers);
  };

  const handleSaveToBackend = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/courier-config', { couriers }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Courier list updated!");
      if (onUpdate) onUpdate(); // Refresh parent component list
      onClose();
    } catch (error) {
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl max-h-[90vh]">
        
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Truck className="w-5 h-5"/></div>
             <h3 className="font-bold text-gray-900 text-lg">Manage Couriers</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {loading ? (
            <div className="flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
          ) : (
            <div className="space-y-6">
              
              {/* Add/Edit Form */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase">{editingIndex >= 0 ? 'Edit Courier' : 'Add New Courier'}</h4>
                <input 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Courier Name (e.g. FedEx)"
                  className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <input 
                  value={formData.trackingUrlBase}
                  onChange={e => setFormData({...formData, trackingUrlBase: e.target.value})}
                  placeholder="Tracking URL Prefix (Optional)"
                  className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <p className="text-[10px] text-gray-400">Example: https://track.com?id= (Leave empty if none)</p>
                <button onClick={handleAddOrUpdate} className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-purple-700 flex items-center justify-center gap-2">
                  {editingIndex >= 0 ? <Save className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
                  {editingIndex >= 0 ? 'Update Courier' : 'Add to List'}
                </button>
              </div>

              {/* List */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-700">Existing Couriers</h4>
                {couriers.length === 0 && <p className="text-sm text-gray-400">No couriers added yet.</p>}
                {couriers.map((c, i) => (
                  <div key={i} className={`flex justify-between items-center p-3 border rounded-lg ${editingIndex === i ? 'bg-purple-50 border-purple-200' : 'hover:bg-gray-50'}`}>
                    <div>
                      <div className="font-bold text-sm text-gray-800">{c.name}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">{c.trackingUrlBase || 'No URL'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(i)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg font-medium">Close</button>
          <button onClick={handleSaveToBackend} disabled={saving} className="px-6 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-md">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourierSettingsModal;
