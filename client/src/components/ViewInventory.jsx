import React, { useEffect, useState, useMemo } from "react";
import { publicApi } from "../utils/axios.js";
import {
  Pencil, Trash2, RefreshCw, Download, AlertTriangle, Loader,
  CheckCircle, AlertCircle, X, Plus, MoreVertical, Package,
  Search, LayoutGrid, List, Image as ImageIcon,
  Link, Tag, Layers, ImagePlus, DollarSign, Hash, FileText,
  Box, ShoppingBag, Eye, EyeOff, Sparkles, Camera, GripVertical,
  Info, ChevronDown, ChevronUp, Star, Zap, Phone, BellRing
} from "lucide-react";

/* ─── Shared atoms ──────────────────────────────────────────── */

const Badge = ({ tone = "neutral", children, className = "" }) => {
  const tones = {
    neutral: "bg-gray-100 text-gray-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
};

const Button = ({ variant = "primary", className = "", children, ...props }) => {
  const base =
    "inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-md text-xs sm:text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2";
  const styles = {
    primary: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-600",
    secondary: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-300",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-600",
    subtle: "bg-gray-100 text-gray-700 hover:bg-gray-200",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Input = ({ className = "", leftIcon: LeftIcon, ...props }) => (
  <div className={`relative ${className}`}>
    {LeftIcon && (
      <LeftIcon className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
    )}
    <input
      {...props}
      className={`w-full rounded-md border border-gray-300 bg-white py-2 sm:py-2.5 pr-3 ${LeftIcon ? "pl-8 sm:pl-10" : "pl-3"
        } text-xs sm:text-sm shadow-sm placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/30`}
    />
  </div>
);

/* ─── Modals ────────────────────────────────────────────────── */

const BaseModal = ({ open, onClose, children, panelClass = "" }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={`relative z-10 w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-black/5 animate-[fadeIn_.2s_ease] max-h-[90vh] overflow-y-auto ${panelClass}`}
      >
        {children}
      </div>
    </div>
  );
};

const SuccessModal = ({ visible, message, onClose }) => (
  <BaseModal open={visible} onClose={onClose}>
    <div className="p-6 sm:p-8 text-center">
      <div className="mx-auto mb-3 sm:mb-4 grid place-items-center h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-green-100">
        <CheckCircle className="h-8 w-8 sm:h-9 sm:w-9 text-green-600" />
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Success</h3>
      <p className="mt-2 text-sm sm:text-base text-gray-600">{message}</p>
      <div className="mt-4 sm:mt-6">
        <Button onClick={onClose} className="px-4 sm:px-5 py-2">OK</Button>
      </div>
    </div>
  </BaseModal>
);

const ErrorModal = ({ visible, message, onClose }) => (
  <BaseModal open={visible} onClose={onClose}>
    <div className="p-6 sm:p-8 text-center">
      <div className="mx-auto mb-3 sm:mb-4 grid place-items-center h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-red-100">
        <AlertCircle className="h-8 w-8 sm:h-9 sm:w-9 text-red-600" />
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Error</h3>
      <p className="mt-2 text-sm sm:text-base text-gray-600">{message}</p>
      <div className="mt-4 sm:mt-6">
        <Button variant="danger" onClick={onClose} className="px-4 sm:px-5 py-2">Close</Button>
      </div>
    </div>
  </BaseModal>
);

const DeleteConfirmationModal = ({ item, isOpen, onClose, onConfirm, isDeleting }) => (
  <BaseModal open={isOpen} onClose={onClose}>
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-full bg-red-100 flex-shrink-0">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900">Delete Product</h3>
          <p className="mt-1 text-xs sm:text-sm text-gray-600">
            Are you sure you want to delete "{item?.name}"? This action cannot be undone.
          </p>
        </div>
      </div>
      <div className="mt-4 sm:mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
        <Button variant="secondary" onClick={onClose} disabled={isDeleting} className="px-4 py-2 w-full sm:w-auto">
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={isDeleting} className="px-4 py-2 w-full sm:w-auto">
          {isDeleting ? (
            <>
              <Loader className="h-4 w-4 animate-spin" /> Deleting…
            </>
          ) : (
            <>Delete</>
          )}
        </Button>
      </div>
    </div>
  </BaseModal>
);

const SectionHeader = ({ icon: Icon, title, subtitle, section, badge, isExpanded, onToggle }) => (
  <button
    type="button"
    onClick={() => onToggle(section)}
    className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white rounded-t-xl border-b hover:from-gray-100 transition-all group"
  >
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-green-100 text-green-600 group-hover:bg-green-200 transition-colors">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-left">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {badge && <Badge tone="green" className="text-[10px]">{badge}</Badge>}
      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
    </div>
  </button>
);

const FormField = ({ label, icon: Icon, required, hint, children }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-700">
      {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
      {label}
      {required && <span className="text-red-500">*</span>}
      {hint && <span className="ml-auto text-[10px] text-gray-400 font-normal">{hint}</span>}
    </label>
    {children}
  </div>
);

/* ─── ProductFormModal ──────────────────────────────────────── */

const ProductFormModal = ({ isOpen, onClose, product, onSave, isSaving }) => {
  const isEditMode = !!product;
  const [formData, setFormData] = useState({});
  const [activeTab, setActiveTab] = useState("basic");
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    pricing: true,
    media: true,
    gallery: false,
  });

  useEffect(() => {
    if (isOpen) {
      setFormData(
        isEditMode
          ? { ...product, additional_images: product.additional_images || [] }
          : {
            name: "",
            retailer_id: "",
            description: "",
            price: "",
            inventory: "",
            condition: "new",
            availability: "in stock",
            image_url: "",
            additional_images: [],
            url: "",
          }
      );
      setActiveTab("basic");
    }
  }, [isOpen, product, isEditMode]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddImage = () => {
    const currentImages = formData.additional_images || [];
    if (currentImages.length >= 10) return;
    setFormData((prev) => ({
      ...prev,
      additional_images: [...(prev.additional_images || []), ""],
    }));
  };

  const handleAdditionalImageChange = (index, value) => {
    const newImages = [...(formData.additional_images || [])];
    newImages[index] = value;
    setFormData((prev) => ({ ...prev, additional_images: newImages }));
  };

  const handleRemoveImage = (index) => {
    const newImages = [...(formData.additional_images || [])];
    newImages.splice(index, 1);
    setFormData((prev) => ({ ...prev, additional_images: newImages }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanedData = {
      ...formData,
      additional_images: formData.additional_images.filter((img) => img.trim() !== ""),
    };
    onSave(cleanedData);
  };

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const completionPercentage = useMemo(() => {
    const fields = ["name", "retailer_id", "price", "inventory", "image_url"];
    const filled = fields.filter((f) => formData[f] && String(formData[f]).trim()).length;
    return Math.round((filled / fields.length) * 100);
  }, [formData]);

  const tabs = [
    { id: "basic", label: "Basic Info", icon: FileText },
    { id: "media", label: "Media", icon: Camera },
    { id: "preview", label: "Preview", icon: Eye },
  ];

  return (
    <BaseModal open={isOpen} onClose={onClose} panelClass="max-w-4xl">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2.5 rounded-xl ${isEditMode ? "bg-blue-100" : "bg-green-100"}`}>
                {isEditMode ? <Pencil className="h-5 w-5 text-blue-600" /> : <Sparkles className="h-5 w-5 text-green-600" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">
                  {isEditMode ? "Edit Product" : "Create New Product"}
                </h2>
                <p className="text-xs text-gray-500 truncate">
                  {isEditMode ? `Editing: ${product?.name}` : "Add a new product to your inventory"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-gray-600">Completion</span>
              <span className={`font-bold ${completionPercentage === 100 ? "text-green-600" : "text-gray-500"}`}>
                {completionPercentage}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${completionPercentage === 100
                    ? "bg-gradient-to-r from-green-500 to-emerald-500"
                    : "bg-gradient-to-r from-green-400 to-green-500"
                  }`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 p-1 bg-gray-100 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs sm:text-sm font-medium transition-all ${activeTab === tab.id ? "bg-white text-green-700 shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="max-h-[55vh] overflow-y-auto">
          {/* Basic Info */}
          {activeTab === "basic" && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <SectionHeader icon={ShoppingBag} title="Product Details" subtitle="Name, SKU and description" section="basic" isExpanded={expandedSections.basic} onToggle={toggleSection} />
                {expandedSections.basic && (
                  <div className="p-4 space-y-4 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField label="Product Name" icon={Tag} required>
                        <div className="relative">
                          <input
                            name="name"
                            value={formData.name || ""}
                            onChange={handleInputChange}
                            placeholder="e.g., Premium Wireless Mouse"
                            required
                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                          />
                          {formData.name && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
                        </div>
                      </FormField>
                      <FormField label="SKU / Product ID" icon={Hash} required hint={isEditMode ? "Read-only" : ""}>
                        <div className="relative">
                          <input
                            name="retailer_id"
                            value={formData.retailer_id || ""}
                            onChange={handleInputChange}
                            placeholder="e.g., SKU-12345"
                            required
                            readOnly={isEditMode}
                            className={`w-full rounded-lg border border-gray-300 bg-white py-2.5 px-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all ${isEditMode ? "bg-gray-50 text-gray-600 cursor-not-allowed" : ""
                              }`}
                          />
                          {isEditMode && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Badge tone="neutral" className="text-[10px]">Locked</Badge>
                            </div>
                          )}
                        </div>
                      </FormField>
                    </div>
                    <FormField label="Description" icon={FileText}>
                      <textarea
                        name="description"
                        value={formData.description || ""}
                        onChange={handleInputChange}
                        rows={4}
                        placeholder="Describe your product features, benefits, and specifications..."
                        className="w-full rounded-lg border border-gray-300 bg-white p-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all resize-none"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-gray-400">Markdown supported</span>
                        <span className="text-[10px] text-gray-400">{(formData.description || "").length} characters</span>
                      </div>
                    </FormField>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <SectionHeader icon={DollarSign} title="Pricing & Inventory" subtitle="Set price and stock levels" section="pricing" isExpanded={expandedSections.pricing} onToggle={toggleSection} />
                {expandedSections.pricing && (
                  <div className="p-4 space-y-4 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField label="Price" icon={DollarSign} required>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</span>
                          <input
                            name="price"
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.price || ""}
                            onChange={handleInputChange}
                            placeholder="0.00"
                            required
                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-8 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                          />
                        </div>
                      </FormField>
                      <FormField label="Inventory Quantity" icon={Box} required>
                        <input
                          name="inventory"
                          type="number"
                          min="0"
                          value={formData.inventory || ""}
                          onChange={handleInputChange}
                          placeholder="Enter stock count"
                          required
                          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField label="Condition" icon={Star}>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "new", label: "New", color: "green" },
                            { value: "refurbished", label: "Refurb", fullLabel: "Refurbished", color: "blue" },
                            { value: "used", label: "Used", color: "yellow" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, condition: option.value }))}
                              title={option.fullLabel || option.label}
                              className={`flex-1 min-w-[70px] py-2.5 px-2 rounded-lg text-xs font-medium border-2 transition-all text-center whitespace-nowrap ${formData.condition === option.value
                                  ? option.color === "green"
                                    ? "border-green-500 bg-green-50 text-green-700"
                                    : option.color === "blue"
                                      ? "border-blue-500 bg-blue-50 text-blue-700"
                                      : "border-yellow-500 bg-yellow-50 text-yellow-700"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </FormField>
                      <FormField label="Availability" icon={Zap}>
                        <div className="flex gap-2">
                          {[
                            { value: "in stock", label: "In Stock", icon: CheckCircle, color: "green" },
                            { value: "out of stock", label: "Out of Stock", icon: X, color: "red" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, availability: option.value }))}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-medium border-2 transition-all whitespace-nowrap ${formData.availability === option.value
                                  ? option.color === "green"
                                    ? "border-green-500 bg-green-50 text-green-700"
                                    : "border-red-500 bg-red-50 text-red-700"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                              <option.icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </FormField>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Media */}
          {activeTab === "media" && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <SectionHeader icon={ImageIcon} title="Main Product Image" subtitle="Primary display image" section="media" isExpanded={expandedSections.media} onToggle={toggleSection} />
                {expandedSections.media && (
                  <div className="p-4 bg-white">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-shrink-0">
                        <div className="relative group">
                          <div className="h-32 w-32 rounded-xl overflow-hidden ring-2 ring-gray-200 bg-gradient-to-br from-gray-100 to-gray-200">
                            {formData.image_url ? (
                              <img
                                src={formData.image_url}
                                alt="Main product"
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = "https://via.placeholder.com/200?text=Invalid+URL";
                                }}
                              />
                            ) : (
                              <div className="h-full w-full flex flex-col items-center justify-center text-gray-400">
                                <Camera className="h-8 w-8 mb-1" />
                                <span className="text-[10px]">No image</span>
                              </div>
                            )}
                          </div>
                          {formData.image_url && (
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, image_url: "" }))}
                              className="absolute -top-2 -right-2 p-1.5 rounded-full bg-red-500 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 space-y-3">
                        <FormField label="Image URL" icon={Link}>
                          <input
                            name="image_url"
                            type="url"
                            value={formData.image_url || ""}
                            onChange={handleInputChange}
                            placeholder="https://example.com/product-image.jpg"
                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                          />
                        </FormField>
                        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                          <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-blue-700">
                            Use high-resolution images (min 800x800px) for best results. Supported formats: JPG, PNG, WebP
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <SectionHeader icon={Layers} title="Product Gallery" subtitle="Additional product images" section="gallery" badge={`${formData.additional_images?.length || 0}/10`} isExpanded={expandedSections.gallery} onToggle={toggleSection} />
                {expandedSections.gallery && (
                  <div className="p-4 bg-white space-y-4">
                    {formData.additional_images?.length > 0 && (
                      <div className="grid grid-cols-5 gap-3">
                        {formData.additional_images.map((img, index) => (
                          <div key={index} className="relative group">
                            <div className="aspect-square rounded-lg overflow-hidden ring-2 ring-gray-200 bg-gray-100">
                              {img ? (
                                <img
                                  src={img}
                                  alt={`Gallery ${index + 1}`}
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.src = "https://via.placeholder.com/100?text=Error";
                                  }}
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-gray-400">
                                  <ImagePlus className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(index)}
                              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500 text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded">
                              {index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {formData.additional_images?.map((img, index) => (
                        <div key={index} className="flex items-center gap-2 group">
                          <div className="flex items-center justify-center w-6 h-6 rounded bg-gray-100 text-gray-500 text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <input
                            type="url"
                            value={img}
                            onChange={(e) => handleAdditionalImageChange(index, e.target.value)}
                            className="flex-1 rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                            placeholder="Enter image URL..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddImage}
                      disabled={(formData.additional_images?.length || 0) >= 10}
                      className={`w-full py-3 px-4 rounded-lg border-2 border-dashed transition-all flex items-center justify-center gap-2 ${(formData.additional_images?.length || 0) >= 10
                          ? "border-gray-200 text-gray-400 cursor-not-allowed"
                          : "border-green-300 text-green-600 hover:border-green-400 hover:bg-green-50"
                        }`}
                    >
                      <ImagePlus className="h-5 w-5" />
                      <span className="font-medium text-sm">
                        {(formData.additional_images?.length || 0) >= 10 ? "Maximum 10 images reached" : "Add Another Image"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {activeTab === "preview" && (
            <div className="p-4 sm:p-6">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 mb-4 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Product Preview
                </h3>
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="flex flex-col sm:flex-row">
                    <div className="sm:w-2/5 bg-gray-100">
                      <div className="aspect-square relative">
                        {formData.image_url ? (
                          <img
                            src={formData.image_url}
                            alt="Preview"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = "https://via.placeholder.com/400?text=No+Image";
                            }}
                          />
                        ) : (
                          <div className="h-full w-full flex flex-col items-center justify-center text-gray-400">
                            <Camera className="h-12 w-12 mb-2" />
                            <span className="text-sm">No image added</span>
                          </div>
                        )}
                        {formData.additional_images?.filter((img) => img).length > 0 && (
                          <div className="absolute bottom-3 right-3 bg-black/70 text-white px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            +{formData.additional_images.filter((img) => img).length} photos
                          </div>
                        )}
                      </div>
                      {formData.additional_images?.filter((img) => img).length > 0 && (
                        <div className="flex gap-2 p-3 overflow-x-auto">
                          <div className="h-12 w-12 rounded-lg overflow-hidden ring-2 ring-green-500 flex-shrink-0">
                            <img src={formData.image_url || "https://via.placeholder.com/60"} alt="Main" className="h-full w-full object-cover" />
                          </div>
                          {formData.additional_images
                            .filter((img) => img)
                            .slice(0, 4)
                            .map((img, idx) => (
                              <div key={idx} className="h-12 w-12 rounded-lg overflow-hidden ring-1 ring-gray-200 flex-shrink-0">
                                <img src={img} alt={`Thumb ${idx + 1}`} className="h-full w-full object-cover" />
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="sm:w-3/5 p-5">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <Badge tone={formData.condition === "new" ? "green" : formData.condition === "refurbished" ? "blue" : "yellow"}>
                          {formData.condition || "new"}
                        </Badge>
                        <Badge tone={formData.availability === "in stock" ? "green" : "red"}>
                          {formData.availability || "in stock"}
                        </Badge>
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">{formData.name || "Product Name"}</h2>
                      <p className="text-xs text-gray-500 mb-4">SKU: {formData.retailer_id || "Not set"}</p>
                      <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-3xl font-bold text-green-600">₹{formData.price || "0.00"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                        <Box className="h-4 w-4" />
                        <span>{formData.inventory || 0} units in stock</span>
                      </div>
                      {formData.description && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Description</h4>
                          <p className="text-sm text-gray-600 line-clamp-3">{formData.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-4 sm:px-6 py-4">
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="h-4 w-4" />
              <span>Fields marked with * are required</span>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <Button type="button" variant="secondary" onClick={onClose} className="px-5 py-2.5 flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className={`px-6 py-2.5 flex-1 sm:flex-none ${isSaving ? "opacity-80 cursor-not-allowed" : ""}`}>
                {isSaving ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    {isEditMode ? "Update Product" : "Create Product"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};

/* ─── ProductCard ───────────────────────────────────────────── */

const ProductCard = ({ item, onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const safeImg = item.image_url || "https://via.placeholder.com/600x400?text=No+Image";
  const priceText = `₹${item.price ?? "0.00"}`;
  const hasExtraImages = item.additional_images && item.additional_images.length > 0;

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-lg">
      <div className="relative">
        <div className="aspect-[4/3] w-full bg-gray-100 relative">
          <img
            src={safeImg}
            alt={item.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.src = "https://via.placeholder.com/600x400?text=No+Image";
            }}
          />
          {hasExtraImages && (
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 backdrop-blur-sm">
              <ImageIcon size={10} />
              <span>+{item.additional_images.length}</span>
            </div>
          )}
        </div>
        <Badge tone={item.synced ? "green" : "yellow"} className="absolute left-2 top-2 shadow-sm">
          {item.synced ? "Synced" : "Pending"}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm sm:text-base font-semibold text-gray-900" title={item.name}>
            {item.name || "Unnamed Product"}
          </h3>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((s) => !s)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 flex-shrink-0"
            >
              <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-32 sm:w-36 overflow-hidden rounded-md border bg-white shadow-lg">
                <button
                  onClick={() => {
                    onEdit(item);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Edit
                </button>
                <button
                  onClick={() => {
                    onDelete(item);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs sm:text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="mt-0.5 text-[10px] sm:text-xs text-gray-500">ID: {item.retailer_id || "N/A"}</p>
        <div className="mt-2 sm:mt-3 grid grid-cols-3 gap-2 border bg-gray-50 p-2 sm:p-3 text-center rounded-lg">
          <div>
            <p className="text-[10px] sm:text-[11px] text-gray-500">Price</p>
            <p className="text-xs sm:text-sm font-semibold text-gray-900">{priceText}</p>
          </div>
          <div>
            <p className="text-[10px] sm:text-[11px] text-gray-500">Inventory</p>
            <p className="text-xs sm:text-sm font-semibold text-gray-900">{item.inventory ?? "-"}</p>
          </div>
          <div>
            <p className="text-[10px] sm:text-[11px] text-gray-500">Status</p>
            <Badge tone={item.availability === "in stock" ? "green" : "red"} className="mt-0.5">
              {item.availability === "in stock" ? "In Stock" : "Out"}
            </Badge>
          </div>
        </div>
        <div className="mt-2 sm:mt-3 flex items-center justify-between">
          <span className="text-[10px] sm:text-xs text-gray-400">Condition: {item.condition || "-"}</span>
        </div>
      </div>
    </div>
  );
};

/* ─── Constants ─────────────────────────────────────────────── */

const DEFAULT_ALERT_CONFIG = {
  enabled: true,
  threshold: 10,
  templateName: "low_stock_alertt",
  templateLanguage: "en",
  messageTemplate:
    "Low stock alert: {{productName}} ({{retailerId}}) is now at {{currentStock}} units. Alert threshold is {{threshold}}. Please restock soon.",
  ceoPhone: "",
  adminPhone: "",
};

/* ═══════════════════════════════════════════════════════════════
   ViewInventory – MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

const ViewInventory = () => {
  const [inventoryData, setInventoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAlertConfigLoading, setIsAlertConfigLoading] = useState(false);
  const [isAlertConfigSaving, setIsAlertConfigSaving] = useState(false);
  const [view, setView] = useState("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [alertConfig, setAlertConfig] = useState(DEFAULT_ALERT_CONFIG);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isAddOrEditModalOpen, setIsAddOrEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [successModal, setSuccessModal] = useState({ visible: false, message: "" });
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });

  /* ── fetchers / handlers (unchanged) ─────────────────────── */

  useEffect(() => {
    fetchInventoryData();
    fetchAlertConfig();
  }, []);

  const fetchInventoryData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await publicApi.get("/api/inventory", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInventoryData(response.data);
    } catch (_err) {
      showErrorModal("Failed to fetch inventory data.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAlertConfig = async () => {
    setIsAlertConfigLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await publicApi.get("/api/inventory/alerts-config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const config = response?.data?.config || DEFAULT_ALERT_CONFIG;
      setAlertConfig({
        enabled: config.enabled !== false,
        threshold: Number(config.threshold) > 0 ? Number(config.threshold) : 10,
        templateName: config.templateName || DEFAULT_ALERT_CONFIG.templateName,
        templateLanguage: config.templateLanguage || "en",
        messageTemplate: config.messageTemplate || DEFAULT_ALERT_CONFIG.messageTemplate,
        ceoPhone: config.ceoPhone || "",
        adminPhone: config.adminPhone || "",
      });
    } catch (_err) {
      showErrorModal("Failed to load low stock alert settings.");
    } finally {
      setIsAlertConfigLoading(false);
    }
  };

  const handleAlertConfigChange = (key, value) => {
    setAlertConfig((prev) => ({ ...prev, [key]: value }));
  };

  const saveAlertConfig = async () => {
    setIsAlertConfigSaving(true);
    try {
      const token = localStorage.getItem("token");
      const parsedThreshold = parseInt(alertConfig.threshold, 10);
      const payload = {
        ...alertConfig,
        threshold: Number.isFinite(parsedThreshold) && parsedThreshold > 0 ? parsedThreshold : 10,
      };
      const response = await publicApi.put("/api/inventory/alerts-config", payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const savedConfig = response?.data?.config || payload;
      setAlertConfig({
        enabled: savedConfig.enabled !== false,
        threshold: Number(savedConfig.threshold) > 0 ? Number(savedConfig.threshold) : 10,
        templateName: savedConfig.templateName || DEFAULT_ALERT_CONFIG.templateName,
        templateLanguage: savedConfig.templateLanguage || "en",
        messageTemplate: savedConfig.messageTemplate || DEFAULT_ALERT_CONFIG.messageTemplate,
        ceoPhone: savedConfig.ceoPhone || "",
        adminPhone: savedConfig.adminPhone || "",
      });
      showSuccessModal("Low stock alert settings saved successfully!");
    } catch (error) {
      showErrorModal(error.response?.data?.message || "Failed to save low stock alert settings.");
    } finally {
      setIsAlertConfigSaving(false);
    }
  };

  const handleSaveItem = async (formData) => {
    setIsSubmitting(true);
    const isEditMode = !!editingItem;
    const url = isEditMode ? `/api/inventory/${editingItem._id}` : "/api/inventory";
    const method = isEditMode ? "put" : "post";
    try {
      const token = localStorage.getItem("token");
      await publicApi[method](url, formData, { headers: { Authorization: `Bearer ${token}` } });
      showSuccessModal(`Product ${isEditMode ? "updated" : "added"} successfully!`);
      closeAddOrEditModal();
      fetchInventoryData();
    } catch (error) {
      showErrorModal(error.response?.data?.message || `Failed to ${isEditMode ? "update" : "add"} product.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await publicApi.delete(`/api/inventory/${itemToDelete._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showSuccessModal("Product deleted successfully!");
      closeDeleteModal();
      fetchInventoryData();
    } catch (error) {
      showErrorModal(error.response?.data?.message || "Failed to delete product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const syncAllProducts = async () => {
    try {
      setIsSyncing(true);
      const token = localStorage.getItem("token");
      await publicApi.post("/api/inventory/sync", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showSuccessModal("Sync initiated successfully!");
    } catch (e) {
      showErrorModal("Failed to initiate sync.");
    } finally {
      await fetchInventoryData();
      setIsSyncing(false);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "retailer_id", "name", "description", "availability", "url",
      "price", "image_url", "additional_images", "inventory", "condition",
    ];
    const rows = filteredInventory.map((item) =>
      headers
        .map((key) => {
          const rawValue =
            key === "additional_images" ? (item.additional_images || []).join(", ") : (item[key] ?? "");
          const str = String(rawValue).replace(/"/g, '""');
          return /[,\n"]/.test(str) ? `"${str}"` : str;
        })
        .join(",")
    );
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `catalogue_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredInventory = useMemo(() => {
    return inventoryData
      .filter((item) => {
        if (filterStatus === "synced") return item.synced;
        if (filterStatus === "pending") return !item.synced;
        return true;
      })
      .filter((item) => {
        const term = searchTerm.toLowerCase();
        return (
          item.name?.toLowerCase().includes(term) ||
          item.retailer_id?.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term)
        );
      });
  }, [inventoryData, searchTerm, filterStatus]);

  const openAddModal = () => { setEditingItem(null); setIsAddOrEditModalOpen(true); };
  const openEditModal = (item) => { setEditingItem(item); setIsAddOrEditModalOpen(true); };
  const closeAddOrEditModal = () => { setIsAddOrEditModalOpen(false); setEditingItem(null); };
  const openDeleteModal = (item) => { setItemToDelete(item); setIsDeleteModalOpen(true); };
  const closeDeleteModal = () => { setIsDeleteModalOpen(false); setItemToDelete(null); };
  const showSuccessModal = (message) => setSuccessModal({ visible: true, message });
  const showErrorModal = (message) => setErrorModal({ visible: true, message });
  const hideSuccessModal = () => setSuccessModal({ visible: false, message: "" });
  const hideErrorModal = () => setErrorModal({ visible: false, message: "" });

  /* ── Table view ──────────────────────────────────────────── */

  const TableView = () => (
    <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-sm border-collapse">
          <thead>
            <tr className="bg-green-100 text-green-800 border-b border-green-200">
              <th className="w-[60px] py-3 px-4 text-center font-semibold">#</th>
              <th className="w-[280px] py-3 px-4 text-left font-semibold">Product</th>
              <th className="w-[120px] py-3 px-4 text-center font-semibold">Inventory</th>
              <th className="w-[120px] py-3 px-4 text-center font-semibold">Stock</th>
              <th className="w-[100px] py-3 px-4 text-center font-semibold">Price</th>
              <th className="w-[100px] py-3 px-4 text-center font-semibold">Status</th>
              <th className="w-[100px] py-3 px-4 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">Loading inventory…</td>
              </tr>
            ) : filteredInventory.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">No products found.</td>
              </tr>
            ) : (
              filteredInventory.map((item, index) => (
                <tr
                  key={item._id}
                  className={`border-b border-gray-100 ${index % 2 === 0 ? "bg-green-50/30" : "bg-white"} hover:bg-green-50 transition`}
                >
                  <td className="py-3 px-4 text-center text-gray-700 font-medium align-middle">{index + 1}</td>
                  <td className="py-3 px-4 align-middle">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-gray-100 ring-1 ring-gray-200 overflow-hidden flex-shrink-0 relative">
                        <img
                          src={
                            item.image_url?.startsWith("http")
                              ? item.image_url
                              : `${process.env.REACT_APP_BACKEND_URL || ""}/${item.image_url}`
                          }
                          alt={item.name}
                          className="h-full w-full object-cover"
                          onError={(e) => (e.currentTarget.src = "https://via.placeholder.com/60?text=No+Img")}
                        />
                        {item.additional_images && item.additional_images.length > 0 && (
                          <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[8px] px-1 rounded-tl-md flex items-center">
                            +{item.additional_images.length}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 break-words">{item.name || "Unnamed Product"}</p>
                        <p className="text-xs text-gray-500 truncate">ID: {item.retailer_id || "-"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center text-gray-800 font-medium align-middle">{item.inventory ?? 0} units</td>
                  <td className="py-3 px-4 text-center align-middle">
                    <Badge tone={item.availability?.toLowerCase() === "in stock" ? "green" : "red"} className="text-[11px] px-2 py-0.5">
                      {item.availability?.toLowerCase() === "in stock" ? "IN STOCK" : "OUT OF STOCK"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-green-700 align-middle">₹{item.price ?? 0}</td>
                  <td className="py-3 px-4 text-center align-middle">
                    <Badge tone={item.synced ? "green" : "yellow"} className="px-2 py-0.5 text-[11px]">
                      {item.synced ? (
                        <span className="flex items-center justify-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Synced
                        </span>
                      ) : (
                        "Pending"
                      )}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center align-middle">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-2 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => openDeleteModal(item)}
                        className="p-2 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-full px-3 sm:px-4 md:px-6 lg:px-1 pb-8 sm:pb-10 sm:pt-5">
      {/* scrollbar-hide utility (used by the mobile action strip) */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar{display:none}
        .scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>

      {/* ── Global modals ─────────────────────────────────── */}
      <SuccessModal visible={successModal.visible} message={successModal.message} onClose={hideSuccessModal} />
      <ErrorModal visible={errorModal.visible} message={errorModal.message} onClose={hideErrorModal} />
      <DeleteConfirmationModal isOpen={isDeleteModalOpen} onClose={closeDeleteModal} onConfirm={handleDelete} item={itemToDelete} isDeleting={isSubmitting} />
      <ProductFormModal isOpen={isAddOrEditModalOpen} onClose={closeAddOrEditModal} product={editingItem} onSave={handleSaveItem} isSaving={isSubmitting} />

      {/* ── Alert-config modal ────────────────────────────── */}
      <BaseModal open={isAlertModalOpen} onClose={() => setIsAlertModalOpen(false)} panelClass="max-w-4xl">
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-green-50 p-2 text-green-600"><BellRing className="h-4 w-4" /></div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Low Stock Alert Settings</h3>
                <p className="text-xs text-gray-500">Send WhatsApp alert to CEO/Admin when product stock drops below threshold.</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsAlertModalOpen(false)} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close alert settings">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
            <label htmlFor="low-stock-enabled" className="font-medium">Enabled</label>
            <input id="low-stock-enabled" type="checkbox" checked={!!alertConfig.enabled} onChange={(e) => handleAlertConfigChange("enabled", e.target.checked)} className="h-4 w-4 accent-green-600" disabled={isAlertConfigLoading || isAlertConfigSaving} />
          </div>
          <div className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${!alertConfig.enabled ? "opacity-60" : ""}`}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Threshold (units)</label>
              <input type="number" min="1" value={alertConfig.threshold} onChange={(e) => handleAlertConfigChange("threshold", e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" disabled={isAlertConfigLoading || isAlertConfigSaving || !alertConfig.enabled} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">CEO WhatsApp Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="text" value={alertConfig.ceoPhone} onChange={(e) => handleAlertConfigChange("ceoPhone", e.target.value)} placeholder="+91XXXXXXXXXX" className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" disabled={isAlertConfigLoading || isAlertConfigSaving || !alertConfig.enabled} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Admin WhatsApp Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="text" value={alertConfig.adminPhone} onChange={(e) => handleAlertConfigChange("adminPhone", e.target.value)} placeholder="+91XXXXXXXXXX" className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" disabled={isAlertConfigLoading || isAlertConfigSaving || !alertConfig.enabled} />
              </div>
            </div>
            {/* <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Template Name</label>
              <input type="text" value={alertConfig.templateName} onChange={(e) => handleAlertConfigChange("templateName", e.target.value)} placeholder="low_stock_alertt" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" disabled={isAlertConfigLoading || isAlertConfigSaving || !alertConfig.enabled} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Template Language</label>
              <input type="text" value={alertConfig.templateLanguage} onChange={(e) => handleAlertConfigChange("templateLanguage", e.target.value)} placeholder="en" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" disabled={isAlertConfigLoading || isAlertConfigSaving || !alertConfig.enabled} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 space-y-1">
              <label className="text-xs font-medium text-gray-700">Alert Text Template (fallback)</label>
              <textarea rows={3} value={alertConfig.messageTemplate} onChange={(e) => handleAlertConfigChange("messageTemplate", e.target.value)} placeholder="Use placeholders like {{productName}}, {{retailerId}}, {{currentStock}}, {{threshold}}" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" disabled={isAlertConfigLoading || isAlertConfigSaving || !alertConfig.enabled} />
            </div> */}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setIsAlertModalOpen(false)} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" disabled={isAlertConfigSaving}>Cancel</button>
            <button type="button" onClick={saveAlertConfig} disabled={isAlertConfigLoading || isAlertConfigSaving} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white ${isAlertConfigSaving ? "bg-green-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"}`}>
              {isAlertConfigSaving ? (<><Loader className="h-4 w-4 animate-spin" /> Saving...</>) : (<><CheckCircle className="h-4 w-4" /> Save Alert Settings</>)}
            </button>
          </div>
        </div>
      </BaseModal>

      {/* ═══════════════════════════════════════════════════════
          ENHANCED TOOLBAR  –  mobile-first, horizontal-scroll
          ═══════════════════════════════════════════════════════ */}
      <div className="mb-3 space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">

        {/* ── LEFT: Search + Filter (always side-by-side) ──── */}
        <div className="flex items-center gap-2 sm:flex-1 sm:gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0 sm:min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products, IDs…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-green-400 bg-white py-2.5 pl-9 pr-3 text-xs sm:text-sm shadow-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30 transition"
            />
            {/* clear button */}
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-shrink-0 w-[105px] sm:w-[170px] appearance-none rounded-xl border border-green-400 bg-white py-2.5 px-3 text-xs sm:text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30 transition bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22%236b7280%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M7%2010l5%205%205-5z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-7"
          >
            <option value="all">All Products</option>
            <option value="synced">Synced</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {/* ── RIGHT: Action strip (horizontal-scroll on mobile) */}
        <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto sm:overflow-visible sm:gap-2.5 -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5 sm:pb-0">
          {/* Add Product */}
          <button
            onClick={openAddModal}
            className="flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:scale-[.97] transition"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden min-[400px]:inline">Add</span>
          </button>

          {/* Stock Alert */}
          <button
            onClick={() => setIsAlertModalOpen(true)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-green-400 bg-white px-3 py-2 text-xs sm:text-sm text-green-700 shadow-sm hover:bg-green-50 active:scale-[.97] transition"
          >
            <BellRing className="h-4 w-4" />
            <span className="hidden min-[400px]:inline sm:hidden lg:inline">Alert</span>
            <span className="hidden sm:inline lg:hidden">Stock Alert</span>
          </button>

          {/* View toggle */}
          <div className="flex-shrink-0 inline-flex items-center rounded-lg border border-green-400 bg-white p-[3px] shadow-sm">
            <button
              onClick={() => setView("list")}
              className={`rounded-md p-[7px] transition ${view === "list" ? "bg-green-600 text-white shadow" : "text-gray-500 hover:bg-green-50"
                }`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`rounded-md p-[7px] transition ${view === "grid" ? "bg-green-600 text-white shadow" : "text-gray-500 hover:bg-green-50"
                }`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          {/* Export */}
          <button
            onClick={exportToCSV}
            className="flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-green-400 bg-white px-3 py-2 text-xs sm:text-sm text-green-700 shadow-sm hover:bg-green-50 active:scale-[.97] transition"
          >
            <Download className="h-4 w-4" />
            <span className="hidden min-[400px]:inline">Export</span>
          </button>

          {/* Sync All */}
          <button
            onClick={syncAllProducts}
            disabled={isSyncing}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm active:scale-[.97] transition ${isSyncing ? "bg-green-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
              }`}
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span className="hidden min-[400px]:inline">
              {isSyncing ? "Syncing…" : "Sync"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Results summary ──────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between px-0.5">
        <p className="text-[11px] sm:text-xs text-gray-500">
          Showing{" "}
          <span className="font-semibold text-gray-800">{filteredInventory.length}</span>
          {filteredInventory.length !== inventoryData.length && (
            <span className="text-gray-400"> of {inventoryData.length}</span>
          )}{" "}
          product{filteredInventory.length !== 1 ? "s" : ""}
          {filterStatus !== "all" && (
            <Badge tone={filterStatus === "synced" ? "green" : "yellow"} className="ml-2">
              {filterStatus}
            </Badge>
          )}
        </p>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      {view === "list" ? (
        <TableView />
      ) : (
        <div className="rounded-lg sm:rounded-xl border bg-white p-3 sm:p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border bg-white p-3 sm:p-4">
                  <div className="aspect-[4/3] w-full rounded-lg bg-gray-200" />
                  <div className="mt-3 sm:mt-4 h-3 sm:h-4 w-3/5 rounded bg-gray-200" />
                  <div className="mt-2 h-2 sm:h-3 w-2/5 rounded bg-gray-200" />
                  <div className="mt-3 sm:mt-4 grid grid-cols-3 gap-2">
                    <div className="h-8 sm:h-10 rounded bg-gray-100" />
                    <div className="h-8 sm:h-10 rounded bg-gray-100" />
                    <div className="h-8 sm:h-10 rounded bg-gray-100" />
                  </div>
                </div>
              ))
              : filteredInventory.length === 0
                ? (
                  <div className="col-span-full flex flex-col items-center justify-center text-center py-12 sm:py-16">
                    <Package className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300" />
                    <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-semibold text-gray-900">
                      No products found
                    </h3>
                    <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-500 px-4">
                      Try a different search or filter.
                    </p>
                  </div>
                )
                : filteredInventory.map((item) => (
                  <ProductCard key={item._id} item={item} onEdit={openEditModal} onDelete={openDeleteModal} />
                ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewInventory;
