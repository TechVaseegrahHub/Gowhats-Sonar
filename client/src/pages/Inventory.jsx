import React, { useState, useEffect } from "react";
import { ShoppingCart, Upload, Plus, Package, Settings2, Save, Loader2 } from "lucide-react";
import AddItemForm from "../components/AddItemForm.jsx";
import BulkUploadForm from "../components/BulkUploadForm.jsx";
import ViewInventory from "../components/ViewInventory.jsx";
import axios from '../utils/axios';
import toast from "react-hot-toast";

// ── Minimal Catalog ID tab ────────────────────────────────────────────────────
const CatalogIdSettings = () => {
  const [catalogId, setCatalogId] = useState("");
  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("token");
        const res   = await axios.get("/api/catalog-settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success && res.data.settings?.catalogId) {
          setCatalogId(res.data.settings.catalogId);
        }
      } catch {
        toast.error("Failed to load Catalog ID");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res   = await axios.post(
        "/api/catalog-settings",
        { catalogId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        toast.success("Catalog ID saved!");
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Error saving Catalog ID");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-green-600" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Catalog Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter your Meta / WhatsApp Catalog ID to link products.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-800">
          Catalog ID <span className="text-red-500">*</span>
        </label>
        <input
          value={catalogId}
          onChange={(e) => setCatalogId(e.target.value)}
          placeholder="e.g. 1237519423845174"
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-green-500 focus:bg-white text-sm font-medium outline-none transition-all duration-200"
        />
        <p className="text-xs text-gray-400">
          Find this in your Meta Business Manager → Commerce Manager.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !catalogId.trim()}
        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-green-600/25 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all duration-200"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save Catalog ID"}
      </button>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
function InventoryManagement() {
  const [activeTab, setActiveTab] = useState("add-item");

  const navItems = [
    { key: "add-item",       label: "Add Item",        icon: Plus      },
    { key: "bulk-upload",    label: "Bulk Upload",     icon: Upload    },
    { key: "view-inventory", label: "View Catalog",    icon: Package   },
    { key: "catalog-id",     label: "Catalog Settings",icon: Settings2 },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "add-item":       return <AddItemForm />;
      case "bulk-upload":    return <BulkUploadForm />;
      case "view-inventory": return <ViewInventory />;
      case "catalog-id":     return <CatalogIdSettings />;
      default:               return null;
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="hidden sm:flex items-center h-16 space-x-3">
            <div className="bg-green-600 p-2 rounded-lg">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-wider text-green-700">
              INVENTORY
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200/50">

            {/* Tab Navigation — scrollable on mobile */}
            <div className="px-6 border-b border-green-200 overflow-x-auto">
              <nav className="flex space-x-6 min-w-max">
                {navItems.map(({ key, label, icon: Icon }) => {
                  const isActive = activeTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-semibold text-sm whitespace-nowrap transition-all duration-200 ${
                        isActive
                          ? "border-green-600 text-green-600"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? "text-green-500" : "text-slate-400"}`} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-4 lg:p-8">{renderContent()}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default InventoryManagement;
