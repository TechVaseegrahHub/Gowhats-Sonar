import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { publicApi } from "../utils/axios";
import { Plus, Loader, CheckCircle, AlertCircle, X, ImagePlus, Trash2 } from "lucide-react";

// --- MODAL & TOAST COMPONENTS (UNCHANGED) ---
const SuccessModal = ({ visible, message, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => { setIsVisible(visible); }, [visible]);
  if (!visible && !isVisible) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-30">
      <div className={`transform transition-all duration-300 ease-in-out ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'} bg-white rounded-lg shadow-xl max-w-sm w-full mx-6`}>
        <div className="flex flex-col items-center p-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <p className="text-lg text-gray-700 text-center mb-6">{message}</p>
          <button onClick={onClose} className="w-full px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors duration-200">
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

const ErrorModal = ({ visible, message, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => { setIsVisible(visible); }, [visible]);
    if (!visible && !isVisible) return null;
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-30">
        <div className={`transform transition-all duration-300 ease-in-out ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'} bg-white rounded-lg shadow-xl max-w-sm w-full mx-6`}>
          <div className="flex flex-col items-center p-8">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-5">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <p className="text-lg text-gray-700 text-center mb-6">{message}</p>
            <button onClick={onClose} className="w-full px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors duration-200">
              OK
            </button>
          </div>
        </div>
      </div>
    );
};

const CustomToast = ({ visible, message, type, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [visible, onClose]);
  if (!visible && !isVisible) return null;
  const bgColor = type === 'success' ? 'bg-white border-l-8 border-green-500' : 'bg-white border-l-8 border-red-500';
  const iconColor = type === 'success' ? 'text-green-500' : 'text-red-500';
  const Icon = type === 'success' ? CheckCircle : AlertCircle;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className={`transform transition-all duration-300 ease-in-out ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'} ${bgColor} text-gray-800 px-6 py-5 rounded-lg shadow-xl max-w-xl w-full mx-6 pointer-events-auto`}>
        <div className="flex items-center"><div className={`flex-shrink-0 ${iconColor}`}><Icon size={32} strokeWidth={2} /></div><div className="ml-4 flex-grow"><p className="text-lg font-medium text-gray-800">{message}</p></div><button onClick={() => { setIsVisible(false); setTimeout(onClose, 300); }} className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors duration-200"><X size={24} /></button></div><div className="mt-3 w-full bg-gray-100 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: '100%', animation: 'shrink 4s linear forwards' }} /></div><style jsx>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
      </div>
    </div>
  );
};


// --- MAIN ADD ITEM FORM COMPONENT ---

function AddItemForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState({ visible: false, message: '', type: 'success' });
  const [successModal, setSuccessModal] = useState({ visible: false, message: "" });
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });

  // ── Additional images state ──────────────────────────────
  const [additionalImages, setAdditionalImages] = useState([]);

  const handleAddImage = () => {
    if (additionalImages.length >= 10) return;
    setAdditionalImages(prev => [...prev, ""]);
  };

  const handleAdditionalImageChange = (index, value) => {
    const updated = [...additionalImages];
    updated[index] = value;
    setAdditionalImages(updated);
  };

  const handleRemoveImage = (index) => {
    setAdditionalImages(prev => prev.filter((_, i) => i !== index));
  };
  // ────────────────────────────────────────────────────────

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: { currency: "INR" }
  });

  const showNotification = (message, type) => {
    setNotification({ visible: true, message, type });
  };
  const showSuccessModal = (message) => {
    setSuccessModal({ visible: true, message });
  };
  const showErrorModal = (message) => {
    setErrorModal({ visible: true, message });
  };
  const hideNotification = () => setNotification(prev => ({ ...prev, visible: false }));
  const hideSuccessModal = () => setSuccessModal(prev => ({ ...prev, visible: false }));
  const hideErrorModal = () => setErrorModal(prev => ({ ...prev, visible: false }));

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      data.price = parseInt(data.price, 10);
      data.inventory = data.inventory ? parseInt(data.inventory, 10) : null;
      // ── Include cleaned additional images ───────────────
      data.additional_images = additionalImages.filter(img => img.trim() !== "");
      // ────────────────────────────────────────────────────
      const token = localStorage.getItem("token");
      await publicApi.post("/api/inventory", data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showSuccessModal("Product added successfully!");
      reset();
      setAdditionalImages([]); // ← reset gallery on success
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || "An unexpected error occurred.";
      showErrorModal(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses = "w-full bg-slate-100 border-transparent rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 focus:bg-white focus:border-transparent transition duration-200 text-slate-800 placeholder-slate-400";
  const FormGroup = ({ label, children, error, className = "" }) => (
    <div className={className}>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error.message}</p>
      )}
    </div>
  );

  return (
    <div className="w-full">
      <CustomToast visible={notification.visible} message={notification.message} type={notification.type} onClose={hideNotification} />
      <SuccessModal visible={successModal.visible} message={successModal.message} onClose={hideSuccessModal} />
      <ErrorModal visible={errorModal.visible} message={errorModal.message} onClose={hideErrorModal} />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          <FormGroup label="Product Name*" error={errors.name} className="md:col-span-2">
            <input {...register("name", { required: "Product name is required" })} type="text" className={inputClasses} placeholder="e.g., Wireless Headphones" disabled={isSubmitting} />
          </FormGroup>

          <FormGroup label="Description*" error={errors.description} className="md:col-span-2">
            <textarea {...register("description", { required: "Description is required" })} rows={4} className={inputClasses} placeholder="Enter a detailed product description" disabled={isSubmitting}></textarea>
          </FormGroup>

          <FormGroup label="Price*" error={errors.price}>
            <input {...register("price", { required: "Price is required", pattern: { value: /^[0-9]+$/, message: "Please enter a valid number" } })} type="number" className={inputClasses} placeholder="e.g., 2999" disabled={isSubmitting} />
          </FormGroup>

          <FormGroup label="Currency*" error={errors.currency}>
            <select {...register("currency", { required: "Currency is required" })} className={inputClasses} disabled={isSubmitting}>
              <option value="INR">INR - Indian Rupee</option>
              <option value="USD">USD - US Dollar</option>
              <option value="SGD">SGD - Singapore Dollar</option>
            </select>
          </FormGroup>

          <FormGroup label="Inventory" error={errors.inventory}>
             <input {...register("inventory", { pattern: { value: /^[0-9]+$/, message: "Please enter a valid number" } })} type="number" className={inputClasses} placeholder="e.g., 100" disabled={isSubmitting} />
          </FormGroup>

          <FormGroup label="SKU*" error={errors.retailer_id}>
            <input {...register("retailer_id", { required: "Product ID is required" })} type="text" className={inputClasses} placeholder="e.g., SKU12345" disabled={isSubmitting} />
          </FormGroup>

          <FormGroup label="Availability*" error={errors.availability}>
            <select {...register("availability", { required: "Availability is required" })} className={inputClasses} disabled={isSubmitting}>
              <option value="">Select availability</option>
              <option value="in stock">In Stock</option>
              <option value="out of stock">Out of Stock</option>
            </select>
          </FormGroup>

          <FormGroup label="Condition (Optional)" error={errors.condition}>
            <select {...register("condition")} className={inputClasses} disabled={isSubmitting}>
              <option value="">Select condition</option>
              <option value="new">New</option>
              <option value="refurbished">Refurbished</option>
              <option value="used">Used</option>
            </select>
          </FormGroup>

          {/* Main image + gallery images together */}
          <div className="md:col-span-2 space-y-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Product Image Link*
            </label>
            {/* Main image */}
            <input
              {...register("image_url", { required: "Image URL is required" })}
              type="url"
              className={inputClasses}
              placeholder="https://example.com/image.png (main image)"
              disabled={isSubmitting}
            />
            {errors.image_url && (
              <p className="mt-1 text-xs text-red-600">{errors.image_url.message}</p>
            )}

            {/* Additional image rows */}
            {additionalImages.map((img, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="url"
                  value={img}
                  onChange={(e) => handleAdditionalImageChange(index, e.target.value)}
                  placeholder={`https://example.com/image-${index + 2}.jpg`}
                  disabled={isSubmitting}
                  className={inputClasses}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  disabled={isSubmitting}
                  className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {/* Add image link */}
            {additionalImages.length < 10 && (
              <button
                type="button"
                onClick={handleAddImage}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium transition-colors pt-1"
              >
                <ImagePlus className="h-4 w-4" />
                Add another image
              </button>
            )}
          </div>

          <FormGroup label="Product Link*" error={errors.url} className="md:col-span-2">
            <input {...register("url")} type="url" className={inputClasses} placeholder="https://example.com/product-page" disabled={isSubmitting} />
          </FormGroup>
        </div>

        <div className="mt-10 flex justify-center">
          <button
            type="submit"
            className={`w-full max-w-xs ${isSubmitting ? "bg-green-500" : "bg-green-600 hover:bg-green-700"} text-white px-6 py-3 rounded-xl font-semibold transition duration-200 flex items-center justify-center space-x-2 shadow-lg text-base`}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Product</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddItemForm;
