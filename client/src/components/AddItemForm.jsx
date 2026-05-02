import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import api from "../utils/axios";
import { Plus, Loader, CheckCircle, AlertCircle, X, UploadCloud, Image as ImageIcon } from "lucide-react";

// --- MODAL COMPONENTS ---
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

// --- MAIN ADD ITEM FORM COMPONENT ---
function AddItemForm() {
  const MAX_ADDITIONAL_IMAGES = 10;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successModal, setSuccessModal] = useState({ visible: false, message: "" });
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });
  const [additionalImageLinks, setAdditionalImageLinks] = useState([""]);
  const [isUploadingMainImage, setIsUploadingMainImage] = useState(false);
  const [uploadingAdditionalImageIndex, setUploadingAdditionalImageIndex] = useState(null);
  const [isCloudinaryUploadEnabled, setIsCloudinaryUploadEnabled] = useState(false);
  const [isCloudinarySettingLoading, setIsCloudinarySettingLoading] = useState(true);

  // Refs to track upload abort and prevent stale state
  const mainImageUploadingRef = useRef(false);
  const additionalImageUploadingRef = useRef(null);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm({
    defaultValues: { currency: "INR" }
  });
  const mainImageUrl = watch("image_url");

  useEffect(() => {
    let isMounted = true;
    const loadCloudinaryUploadSetting = async () => {
      try {
        setIsCloudinarySettingLoading(true);
        const response = await api.get("/api/catalog-settings");
        const enabled = response.data?.settings?.aiConfig?.cloudinaryImageUploadEnabled !== false;
        if (isMounted) setIsCloudinaryUploadEnabled(enabled);
      } catch {
        if (isMounted) setIsCloudinaryUploadEnabled(true);
      } finally {
        if (isMounted) setIsCloudinarySettingLoading(false);
      }
    };
    loadCloudinaryUploadSetting();
    return () => { isMounted = false; };
  }, []);

  const showSuccessModal = (message) => setSuccessModal({ visible: true, message });
  const showErrorModal = (message) => setErrorModal({ visible: true, message });
  const hideSuccessModal = () => setSuccessModal(prev => ({ ...prev, visible: false }));
  const hideErrorModal = () => setErrorModal(prev => ({ ...prev, visible: false }));

  const addAdditionalImageField = () => {
    if (additionalImageLinks.length >= MAX_ADDITIONAL_IMAGES) return;
    setAdditionalImageLinks(prev => [...prev, ""]);
  };

  const updateAdditionalImageField = (index, value) => {
    setAdditionalImageLinks(prev =>
      prev.map((item, i) => (i === index ? value : item))
    );
  };

  const removeAdditionalImageField = (index) => {
    setAdditionalImageLinks(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImageToCloudinary = async (file) => {
    if (!file) throw new Error("Please choose an image file.");
    if (isCloudinarySettingLoading) throw new Error("Please wait while upload availability is loading.");
    if (!isCloudinaryUploadEnabled) throw new Error("Cloudinary image upload is disabled for this tenant.");

    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post("/api/inventory/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return response.data?.url || "";
  };

  const handleMainImageUpload = async (event) => {
    const file = event.target.files?.[0];
    // Reset input immediately so same file can be re-selected
    event.target.value = "";

    if (!file) return;

    // Prevent double uploads
    if (mainImageUploadingRef.current) return;
    mainImageUploadingRef.current = true;
    setIsUploadingMainImage(true);

    try {
      const uploadedUrl = await uploadImageToCloudinary(file);
      setValue("image_url", uploadedUrl);
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to upload image.";
      showErrorModal(`Error: ${errorMessage}`);
    } finally {
      mainImageUploadingRef.current = false;
      setIsUploadingMainImage(false);
      // Blur without scroll
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }
  };

  const handleAdditionalImageUpload = async (index, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    // Prevent double uploads on same index
    if (additionalImageUploadingRef.current === index) return;
    additionalImageUploadingRef.current = index;
    setUploadingAdditionalImageIndex(index);

    try {
      const uploadedUrl = await uploadImageToCloudinary(file);
      updateAdditionalImageField(index, uploadedUrl);
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to upload image.";
      showErrorModal(`Error: ${errorMessage}`);
    } finally {
      additionalImageUploadingRef.current = null;
      setUploadingAdditionalImageIndex(null);
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      if (isUploadingMainImage || uploadingAdditionalImageIndex !== null) {
        throw new Error("Please wait for image uploads to finish.");
      }

      const cleanedAdditionalImages = additionalImageLinks
        .map(url => url.trim())
        .filter(Boolean)
        .slice(0, MAX_ADDITIONAL_IMAGES);

      const payload = {
        ...data,
        retailer_id: String(data.retailer_id || "").trim(),
        price: data.price === "" || data.price === undefined ? null : parseFloat(data.price),
        inventory:
          data.inventory === "" || data.inventory === undefined
            ? null
            : parseInt(data.inventory, 10),
        additional_images: cleanedAdditionalImages,
      };

      if (!payload.retailer_id) throw new Error("SKU is required.");
      if (payload.price === null || Number.isNaN(payload.price)) throw new Error("Price is required.");
      if (data.inventory !== "" && data.inventory !== undefined && Number.isNaN(payload.inventory)) {
        throw new Error("Inventory must be a valid number.");
      }

      await api.post("/api/inventory", payload);
      showSuccessModal("Product added successfully!");
      reset();
      setAdditionalImageLinks([""]);
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
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error.message}</p>}
    </div>
  );

  return (
    <div className="w-full">
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

          <FormGroup label="SKU*" error={errors.retailer_id}>
            <input {...register("retailer_id", { required: "SKU is required" })} type="text" className={inputClasses} placeholder="e.g., SKU12345" disabled={isSubmitting} />
          </FormGroup>

          <FormGroup label="Currency*" error={errors.currency}>
            <input {...register("currency", { required: "Currency is required" })} type="text" className={inputClasses} disabled={isSubmitting} />
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

          <FormGroup label="Price*" error={errors.price}>
            <input {...register("price", { required: "Price is required" })} type="number" step="0.01" className={inputClasses} placeholder="e.g., 2999" disabled={isSubmitting} />
          </FormGroup>

          <FormGroup label="Inventory (Optional)" error={errors.inventory}>
            <input {...register("inventory")} type="number" className={inputClasses} placeholder="e.g., 100" disabled={isSubmitting} />
          </FormGroup>

          {/* Main Image */}
          <FormGroup label="Product Image Link*" error={errors.image_url} className="md:col-span-2">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-start">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white flex-shrink-0">
                  {mainImageUrl ? (
                    <img src={mainImageUrl} alt="Product preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                      <ImageIcon className="h-7 w-7" />
                      <span className="text-[11px]">No image</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <input
                    {...register("image_url", { required: "Image URL is required" })}
                    type="url"
                    className={inputClasses}
                    placeholder="https://example.com/image.png"
                    disabled={isSubmitting || isUploadingMainImage}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {!isCloudinarySettingLoading && isCloudinaryUploadEnabled && (
                      <label
                        className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
                          isUploadingMainImage
                            ? "bg-green-400 cursor-not-allowed pointer-events-none"
                            : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        {isUploadingMainImage
                          ? <Loader className="h-4 w-4 animate-spin" />
                          : <UploadCloud className="h-4 w-4" />
                        }
                        <span>{isUploadingMainImage ? "Uploading..." : "Upload From Device"}</span>
                        {!isUploadingMainImage && (
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={handleMainImageUpload}
                            disabled={isSubmitting || isUploadingMainImage}
                          />
                        )}
                      </label>
                    )}
                    <p className="text-xs text-slate-500">
                      {isCloudinarySettingLoading
                        ? "Checking upload availability..."
                        : isCloudinaryUploadEnabled
                          ? "Upload an image to Cloudinary or paste an existing image URL."
                          : "Paste an existing image URL. Cloudinary uploads are disabled for this tenant."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </FormGroup>

          {/* Additional Images */}
          <div className="md:col-span-2 rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Additional Product Image Links (Optional)</p>
                <p className="text-xs text-slate-500">
                  {isCloudinarySettingLoading
                    ? `Add up to ${MAX_ADDITIONAL_IMAGES} extra image URLs.`
                    : isCloudinaryUploadEnabled
                      ? `Add up to ${MAX_ADDITIONAL_IMAGES} extra image URLs or upload them to Cloudinary.`
                      : `Add up to ${MAX_ADDITIONAL_IMAGES} extra image URLs. Cloudinary uploads are disabled.`}
                </p>
              </div>
              <button
                type="button"
                onClick={addAdditionalImageField}
                disabled={isSubmitting || additionalImageLinks.length >= MAX_ADDITIONAL_IMAGES}
                className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Image
              </button>
            </div>

            <div className="space-y-2">
              {additionalImageLinks.map((imageUrl, index) => {
                const isUploadingThis = uploadingAdditionalImageIndex === index;
                return (
                  <div key={`additional-image-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white flex-shrink-0">
                        {imageUrl ? (
                          <img src={imageUrl} alt={`Additional ${index + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-slate-400">
                            <ImageIcon className="h-5 w-5" />
                            <span className="text-[10px]">Image {index + 1}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-3">
                        <input
                          type="url"
                          value={imageUrl}
                          onChange={e => updateAdditionalImageField(index, e.target.value)}
                          className={inputClasses}
                          placeholder={`https://example.com/image-${index + 2}.png`}
                          disabled={isSubmitting || isUploadingThis}
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          {!isCloudinarySettingLoading && isCloudinaryUploadEnabled && (
                            <label
                              className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white transition ${
                                isUploadingThis
                                  ? "bg-green-400 cursor-not-allowed pointer-events-none"
                                  : "bg-green-600 hover:bg-green-700"
                              }`}
                            >
                              {isUploadingThis
                                ? <Loader className="h-4 w-4 animate-spin" />
                                : <UploadCloud className="h-4 w-4" />
                              }
                              <span>{isUploadingThis ? "Uploading..." : "Upload Image"}</span>
                              {!isUploadingThis && (
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif"
                                  className="hidden"
                                  onChange={e => handleAdditionalImageUpload(index, e)}
                                  disabled={isSubmitting || isUploadingThis}
                                />
                              )}
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAdditionalImageField(index)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSubmitting || additionalImageLinks.length === 1 || isUploadingThis}
                            title="Remove image link"
                            aria-label={`Remove additional image ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <FormGroup label="Product Link (Optional)" error={errors.url} className="md:col-span-2">
            <input {...register("url")} type="url" className={inputClasses} placeholder="https://example.com/product-page" disabled={isSubmitting} />
          </FormGroup>
        </div>

        {/* Submit Button */}
        <div className="mt-10 flex justify-center">
          <button
            type="submit"
            className={`w-full max-w-xs ${isSubmitting ? "bg-green-500" : "bg-green-600 hover:bg-green-700"} text-white px-6 py-3 rounded-xl font-semibold transition duration-200 flex items-center justify-center space-x-2 shadow-lg text-base`}
            disabled={isSubmitting || isUploadingMainImage || uploadingAdditionalImageIndex !== null}
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
