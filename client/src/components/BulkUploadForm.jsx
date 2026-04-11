import React, { useState, useEffect } from "react";
import { publicApi } from "../utils/axios";
import { Upload, Download, Loader, CheckCircle, AlertCircle, X, FileText } from "lucide-react";

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

// --- MAIN BULK UPLOAD FORM COMPONENT ---

function BulkUploadForm() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState(null);
  
  const [notification, setNotification] = useState({ visible: false, message: '', type: 'success' });
  const [successModal, setSuccessModal] = useState({ visible: false, message: "" });
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });

  const showNotification = (message, type) => setNotification({ visible: true, message, type });
  const showSuccessModal = (message) => setSuccessModal({ visible: true, message });
  const showErrorModal = (message) => setErrorModal({ visible: true, message });
  const hideNotification = () => setNotification(prev => ({ ...prev, visible: false }));
  const hideSuccessModal = () => setSuccessModal(prev => ({ ...prev, visible: false }));
  const hideErrorModal = () => setErrorModal(prev => ({ ...prev, visible: false }));

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
    } else {
      setFileName(null);
    }
  };

  const handleFileUpload = async (event) => {
    event.preventDefault();
    setIsProcessing(true);
    setFileName(null);

    try {
      const file = event.target.file.files[0];
      if (!file) {
        showErrorModal("Please select a CSV file to upload.");
        setIsProcessing(false);
        return;
      }

      if (!file.name.endsWith(".csv")) {
        showErrorModal("Invalid file type. Please upload a CSV file.");
        setIsProcessing(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");
      const response = await publicApi.post("/api/inventory/upload/csv", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data.success) {
        showSuccessModal(response.data.message || "File uploaded and processed successfully!");
        event.target.reset();
      } else {
        showErrorModal(response.data.message || "An error occurred during upload.");
      }
    } catch (error) {
      showErrorModal(error.response?.data?.message || "A server error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full">
      <CustomToast visible={notification.visible} message={notification.message} type={notification.type} onClose={hideNotification} />
      <SuccessModal visible={successModal.visible} message={successModal.message} onClose={hideSuccessModal} />
      <ErrorModal visible={errorModal.visible} message={errorModal.message} onClose={hideErrorModal} />

      {/* Instructions Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <Download className="h-5 w-5 mr-2.5 text-green-600" />
          Get Started with Bulk Upload
        </h3>
        <p className="text-slate-600 text-sm mb-4">Follow these simple steps to add multiple products at once:</p>
        <div className="space-y-3">
            <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 bg-green-100 text-green-700 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">1</div>
                <p className="text-slate-600 text-sm">Download our CSV template to get the correct format.</p>
            </div>
             <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 bg-green-100 text-green-700 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">2</div>
                <div className="text-slate-600 text-sm">
                  <p>Fill in details. <strong>New:</strong> Use the <code>additional_images</code> column for extra photos.</p>
                  <p className="text-xs text-slate-500 mt-1">Format: <code>https://img1.com, https://img2.com</code> (comma separated)</p>
                </div>
            </div>
             <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 bg-green-100 text-green-700 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">3</div>
                <p className="text-slate-600 text-sm">Upload the completed CSV file below.</p>
            </div>
        </div>
        <div className="mt-6">
            <a
                href="https://docs.google.com/spreadsheets/d/16mYEvBWYRvJJ1aJtVKJ1pQEzHibAa-__/export?format=csv"
                className="inline-flex items-center px-5 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition duration-200 text-sm shadow-sm"
            >
                <Download className="h-4 w-4 mr-2" />
                Download CSV Template
            </a>
        </div>
      </div>
      
      {/* Upload Form */}
      <form
        id="bulkUploadForm"
        onSubmit={handleFileUpload}
        encType="multipart/form-data"
        className="w-full"
      >
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6">
          <label 
            htmlFor="file-upload"
            className="relative block w-full border-2 border-dashed border-slate-300 hover:border-green-500 transition-colors duration-200 rounded-xl p-8 text-center cursor-pointer"
          >
            <div className="flex flex-col items-center justify-center text-slate-500">
                <div className="bg-green-100 p-3 rounded-full mb-3">
                    <Upload className="h-6 w-6 text-green-600" />
                </div>
                <p className="font-semibold">
                  <span className="text-green-600">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs mt-1">CSV files only (max 5MB)</p>
            </div>
            <input
              id="file-upload"
              name="file"
              type="file"
              accept=".csv"
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              onChange={handleFileChange}
              required
            />
          </label>
          
          {fileName && (
              <div className="mt-4 bg-green-50 border border-green-200 text-green-800 text-sm font-medium px-4 py-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center">
                  <FileText className="h-5 w-5 mr-2.5" />
                  <span>{fileName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('bulkUploadForm').reset();
                    setFileName(null);
                  }}
                  className="p-1 rounded-full hover:bg-green-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
          )}

        </div>
        
        <div className="mt-6">
          <button
            type="submit"
            disabled={isProcessing}
            className="w-full flex items-center justify-center px-6 py-3.5 border border-transparent text-base font-semibold rounded-xl text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-200 shadow-lg disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                Processing File...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 mr-2.5" />
                Upload and Process
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BulkUploadForm;
