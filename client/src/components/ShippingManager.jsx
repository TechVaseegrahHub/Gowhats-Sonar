import React, { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import toast from "react-hot-toast";
import { publicApi } from "../utils/axios.js";

import {
  Truck,
  Plus,
  Edit3,
  Trash2,
  Package,
  Save,
  X,
  CheckCircle2,
  Settings,
  Gift,
  Search,
  ChevronDown,
  MapPin,
  ExternalLink,
  Info,
  IndianRupee,
  Layers,
  Calculator,
  ArrowRight,
  Globe
} from "lucide-react";

const ShippingManager = ({
  mode = "settings",
  orderAmount = 0,
  packageWeight = 0,
  customerDetails = {},
  onShippingSelect = null,
  selectedMethodId = null,
  disabled = false
}) => {
  const [shippingMethods, setShippingMethods] = useState([]);
  const [shippingQuotes, setShippingQuotes] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [stateRatesData, setStateRatesData] = useState([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
    control,
    getValues
  } = useForm({
    defaultValues: {
      methodName: "",
      courierType: "courier",
      freeShippingAmount: "",
      fixedShippingRate: "",
      trackingUrl: "",
      useStateWiseRates: false,
      isActive: true,
      slabConfig: {
        zoneAStates: "Tamil Nadu, Puducherry",
        zoneASlabs: [],
        zoneBSlabs: [],
        dynamicIncrement: {
          enabled: true,
          thresholdAmount: 1100,
          baseRate: 150,
          everyAmount: 200,
          addRate: 30
        }
      }
    }
  });

  const { fields: slabAFields, append: appendSlabA, remove: removeSlabA, replace: replaceSlabA } = useFieldArray({ control, name: "slabConfig.zoneASlabs" });
  const { fields: slabBFields, append: appendSlabB, remove: removeSlabB, replace: replaceSlabB } = useFieldArray({ control, name: "slabConfig.zoneBSlabs" });

  const courierType = watch("courierType");
  const useStateWiseRates = watch("useStateWiseRates");
  const isDynamicEnabled = watch("slabConfig.dynamicIncrement.enabled");

  // --- Auto-Populate Templates ---
  useEffect(() => {
    if (courierType === 'slab' && showAddModal && !editingMethod) {
      const currentA = getValues('slabConfig.zoneASlabs');
      const currentB = getValues('slabConfig.zoneBSlabs');

      if (!currentA || currentA.length === 0) {
        replaceSlabA([
          { min: 0, max: 350, rate: 40 },
          { min: 351, max: 525, rate: 60 },
          { min: 526, max: 700, rate: 80 },
          { min: 701, max: 898, rate: 120 },
          { min: 899, max: 99999, rate: 0 }
        ]);
      }
      if (!currentB || currentB.length === 0) {
        replaceSlabB([
          { min: 0, max: 300, rate: 45 },
          { min: 301, max: 500, rate: 60 },
          { min: 501, max: 700, rate: 90 },
          { min: 701, max: 900, rate: 120 },
          { min: 901, max: 1100, rate: 150 }
        ]);
      }
    }
  }, [courierType, showAddModal, editingMethod, replaceSlabA, replaceSlabB, getValues]);

  // --- Data Loading ---
  useEffect(() => {
    if (mode === "settings") loadShippingMethods();
    else if (mode === "order-selector" && orderAmount > 0) getShippingQuotes();
  }, [mode, orderAmount, packageWeight]);

  const loadShippingMethods = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await publicApi.get("/api/shipping/methods", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) setShippingMethods(res.data.methods || []);
    } catch (err) {
      toast.error("Failed to load shipping methods");
    } finally {
      setLoading(false);
    }
  };

  const getShippingQuotes = async () => {
    try {
      setCalculating(true);
      const token = localStorage.getItem("token");
      const res = await publicApi.post(
        "/api/shipping/calculate",
        {
          customerPhone: customerDetails.phone || "",
          orderDetails: {
            orderAmount,
            packageWeight,
            itemCount: customerDetails.itemCount || 1
          },
          customerAddress: customerDetails.address || {}
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) setShippingQuotes(res.data.shippingOptions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCalculating(false);
    }
  };

  // --- SAVE Logic ---
  const onSubmit = async (data) => {
    console.log("Submit triggered", data);
    try {
      const token = localStorage.getItem("token");
      // Deep copy to safely modify
      const payload = JSON.parse(JSON.stringify(data));

      // --- Data formatting for Slab type ---
      if (data.courierType === 'slab') {
        // Ensure slabConfig exists
        if (!payload.slabConfig) payload.slabConfig = {};
        
        // Convert comma-separated string to array
        if (typeof data.slabConfig?.zoneAStates === 'string') {
          payload.slabConfig.zoneAStates = data.slabConfig.zoneAStates.split(',').map(s => s.trim());
        }
        
        // Ensure dynamicIncrement defaults if missing
        if (!payload.slabConfig.dynamicIncrement) {
            payload.slabConfig.dynamicIncrement = { enabled: false };
        }
        
        // Reset unused fields
        payload.fixedShippingRate = 0;
        payload.freeShippingAmount = 0;
      }

      // --- Data formatting for Courier type ---
      if (data.courierType === 'courier') {
         if (data.useStateWiseRates) {
            payload.stateRates = stateRatesData.filter(sr => sr.rate > 0);
            payload.fixedShippingRate = 0;
         } else {
            payload.stateRates = [];
            payload.fixedShippingRate = parseFloat(data.fixedShippingRate) || 0;
         }
         // Clear slab config if switching to courier to keep DB clean
         payload.slabConfig = undefined; 
      }

      // --- Data formatting for Free Shipping ---
      if (data.courierType === 'freeshipping') {
          payload.freeShippingAmount = parseFloat(data.freeShippingAmount) || 0;
          payload.fixedShippingRate = 0;
          payload.slabConfig = undefined;
      }

      const url = editingMethod ? `/api/shipping/methods/${editingMethod._id}` : "/api/shipping/methods";
      const method = editingMethod ? "put" : "post";

      console.log("Sending Payload to Server:", payload);

      const res = await publicApi[method](url, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success("Saved successfully!");
        loadShippingMethods();
        handleCloseModal();
      }
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err.response?.data?.message || "Error saving configuration");
    }
  };

  // ✅ Debugging function to catch form errors
  const onError = (errors) => {
    console.error("Form Validation Errors:", errors);
    const firstError = Object.values(errors)[0];
    if (firstError) {
        toast.error(`Validation Error: ${firstError.message || "Check fields"}`);
    }
  };

  const handleDeleteMethod = async (id) => {
    if (window.confirm("Are you sure you want to delete this shipping method?")) {
      try {
        const token = localStorage.getItem("token");
        await publicApi.delete(`/api/shipping/methods/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        loadShippingMethods();
        toast.success("Deleted successfully");
      } catch {
        toast.error("Failed to delete");
      }
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingMethod(null);
    reset({
      methodName: "",
      courierType: "courier",
      fixedShippingRate: "",
      slabConfig: {
        zoneAStates: "Tamil Nadu, Puducherry",
        zoneASlabs: [],
        zoneBSlabs: [],
        dynamicIncrement: { enabled: true, thresholdAmount: 1100, baseRate: 150, everyAmount: 200, addRate: 30 }
      }
    });
  };

  const handleEditMethod = (m) => {
    setEditingMethod(m);
    
    // Prepare form data for editing
    const formData = {
      ...m,
      slabConfig: {
        ...m.slabConfig,
        // Convert array back to string for input if it exists
        zoneAStates: Array.isArray(m.slabConfig?.zoneAStates) 
          ? m.slabConfig.zoneAStates.join(', ') 
          : "Tamil Nadu, Puducherry",
        // Ensure arrays exist
        zoneASlabs: m.slabConfig?.zoneASlabs || [],
        zoneBSlabs: m.slabConfig?.zoneBSlabs || [],
        dynamicIncrement: m.slabConfig?.dynamicIncrement || { enabled: true, thresholdAmount: 1100, baseRate: 150, everyAmount: 200, addRate: 30 }
      }
    };

    reset(formData);
    setShowAddModal(true);
  };

  const formatCurrency = (amt) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amt);

  // --- Render Helpers ---
  const renderSlabTable = (fields, registerName, removeFunc, colorClass) => (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className={`bg-${colorClass}-50 border-b border-${colorClass}-100`}>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Min Amount</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Max Amount</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Rate</th>
            <th className="px-4 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {fields.map((field, index) => (
            <tr key={field.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                  <input type="number" {...register(`${registerName}.${index}.min`)} className="w-full pl-6 pr-3 py-1.5 border border-gray-200 rounded text-sm focus:border-emerald-500 outline-none" />
                </div>
              </td>
              <td className="px-4 py-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                  <input type="number" {...register(`${registerName}.${index}.max`)} className="w-full pl-6 pr-3 py-1.5 border border-gray-200 rounded text-sm focus:border-emerald-500 outline-none" />
                </div>
              </td>
              <td className="px-4 py-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                  <input type="number" {...register(`${registerName}.${index}.rate`)} className="w-full pl-6 pr-3 py-1.5 border border-gray-200 rounded text-sm font-bold text-gray-800 bg-gray-50 focus:border-emerald-500 outline-none" />
                </div>
              </td>
              <td className="px-4 py-2 text-center">
                <button type="button" onClick={() => removeFunc(index)} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) return (
    <div className="flex justify-center items-center h-64 bg-white rounded-xl border border-gray-100">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
        <p className="text-gray-400 text-sm">Loading settings...</p>
      </div>
    </div>
  );

  if (mode === "order-selector") {
    return (
        <div className="space-y-3">
          {shippingQuotes.map((quote) => (
            <div key={quote.methodId} onClick={() => onShippingSelect(quote)} className={`p-4 border rounded-xl cursor-pointer transition-all ${selectedMethodId === quote.methodId ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'bg-white hover:border-emerald-300'}`}>
                <div className="flex justify-between font-bold text-sm text-gray-800">
                    <span>{quote.methodName}</span>
                    <span className="text-emerald-700">{quote.shippingCost === 0 ? 'Free' : formatCurrency(quote.shippingCost)}</span>
                </div>
                {quote.reason && <div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Info size={10}/> {quote.reason}</div>}
            </div>
          ))}
        </div>
    );
  }

  const simpleInputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all";

  // --- Main Render ---
  return (
    <div className="w-full bg-gray-50/50 min-h-screen p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-200">
                <Truck className="w-5 h-5 text-white" />
              </div>
              Shipping Methods
            </h1>
            <p className="text-sm text-gray-500 mt-1 ml-13">Manage delivery partners and pricing rules</p>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95"
          >
            <Plus size={20}/> Add New Method
          </button>
        </div>

        {/* Methods Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shippingMethods.map(method => (
            <div key={method._id} className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:border-emerald-200 transition-all duration-300 group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  method.courierType === 'slab' ? 'bg-purple-100 text-purple-600' : 
                  method.courierType === 'freeshipping' ? 'bg-amber-100 text-amber-600' :
                  'bg-emerald-100 text-emerald-600'
                }`}>
                  {method.courierType === 'slab' ? <Layers size={24}/> : method.courierType === 'freeshipping' ? <Gift size={24}/> : <Truck size={24}/>}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEditMethod(method)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Edit3 size={18}/></button>
                  <button onClick={() => handleDeleteMethod(method._id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18}/></button>
                </div>
              </div>
              
              <h3 className="font-bold text-lg text-gray-900 mb-1">{method.methodName}</h3>
              <div className="mb-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                  method.courierType === 'slab' ? 'bg-purple-50 text-purple-700' :
                  method.courierType === 'freeshipping' ? 'bg-amber-50 text-amber-700' :
                  'bg-emerald-50 text-emerald-700'
                }`}>
                  {method.courierType === 'freeshipping' ? 'Free Shipping Rule' : method.courierType === 'slab' ? 'Slab / Excel Pricing' : 'Standard Courier'}
                </span>
              </div>

              <div className="mt-auto pt-4 border-t border-dashed border-gray-100 flex items-center justify-between text-sm">
                <span className={`flex items-center gap-1.5 ${method.isActive ? "text-emerald-600" : "text-gray-400"}`}>
                  {method.isActive ? <CheckCircle2 size={14}/> : <X size={14}/>}
                  {method.isActive ? "Active" : "Inactive"}
                </span>
                {method.courierType === 'courier' && <span className="font-bold">₹{method.fixedShippingRate}</span>}
              </div>
            </div>
          ))}
          
          {shippingMethods.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                <Package size={32}/>
              </div>
              <h3 className="text-lg font-medium text-gray-900">No shipping methods configured</h3>
              <p className="text-gray-500 text-sm mt-1">Create your first shipping rule to get started.</p>
            </div>
          )}
        </div>

        {/* ADD/EDIT MODAL */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
            <div className="bg-white w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
              
              {/* Modal Header */}
              <div className="flex-none px-8 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    {editingMethod ? <Edit3 className="w-6 h-6 text-emerald-600"/> : <Plus className="w-6 h-6 text-emerald-600"/>}
                    {editingMethod ? 'Edit Shipping Method' : 'New Shipping Method'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Configure delivery rules and pricing logic</p>
                </div>
                <button onClick={handleCloseModal} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={24} className="text-gray-500"/>
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-8">
                  
                  {/* Basic Details Card */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-white">
                      <h3 className="text-lg font-bold text-gray-900">Basic Configuration</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Method Name</label>
                        <input {...register("methodName", { required: "Method Name is required" })} className={simpleInputClass} placeholder="e.g. ST Courier"/>
                        {errors.methodName && <p className="text-red-500 text-xs mt-1">{errors.methodName.message}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Calculation Logic</label>
                        <div className="relative">
                          <select {...register("courierType")} className={simpleInputClass + " appearance-none cursor-pointer bg-white"}>
                            <option value="courier">Flat Rate / State Rate</option>
                            <option value="slab">Slab / Range Based (Excel Logic)</option>
                            <option value="freeshipping">Free Shipping Rule</option>
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18}/>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* LOGIC UI */}
                  {courierType === 'courier' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer border border-gray-200 hover:border-emerald-300 transition-all mb-6 group">
                        <input type="checkbox" {...register("useStateWiseRates")} className="w-5 h-5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"/>
                        <div>
                          <div className="font-bold text-gray-900 group-hover:text-emerald-700">Use State-wise Rates</div>
                          <div className="text-xs text-gray-500">Configure different rates for each state</div>
                        </div>
                      </label>
                      
                      {!useStateWiseRates && (
                        <div className="max-w-xs">
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Fixed Delivery Charge</label>
                          <div className="relative">
                            <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                            <input type="number" {...register("fixedShippingRate")} className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="50"/>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {courierType === 'slab' && (
                    <div className="space-y-6">
                      {/* Zone A */}
                      <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
                        <div className="bg-purple-50 px-6 py-4 border-b border-purple-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                          <div>
                            <h3 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                              <MapPin size={20}/> Zone A: Primary Region
                            </h3>
                            <p className="text-xs text-purple-600 mt-0.5">Rates for specific nearby states</p>
                          </div>
                          <input 
                            {...register("slabConfig.zoneAStates")}
                            className="w-full sm:w-1/2 px-4 py-2 border border-purple-200 rounded-lg text-sm focus:border-purple-500 outline-none bg-white placeholder-purple-300" 
                            placeholder="Tamil Nadu, Puducherry"
                          />
                        </div>
                        <div className="p-6">
                          {renderSlabTable(slabAFields, "slabConfig.zoneASlabs", removeSlabA, "purple")}
                          <button type="button" onClick={() => appendSlabA({ min: 0, max: 0, rate: 0 })} className="mt-4 text-xs font-bold text-purple-700 hover:bg-purple-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1">+ Add Range</button>
                        </div>
                      </div>

                      {/* Zone B */}
                      <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
                        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
                          <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                            <Globe size={20}/> Zone B: Rest of India (Postal)
                          </h3>
                          <p className="text-xs text-blue-600 mt-0.5">Rates for all other locations</p>
                        </div>
                        <div className="p-6">
                          {renderSlabTable(slabBFields, "slabConfig.zoneBSlabs", removeSlabB, "blue")}
                          <button type="button" onClick={() => appendSlabB({ min: 0, max: 0, rate: 0 })} className="mt-4 text-xs font-bold text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1">+ Add Range</button>

                          {/* Dynamic Rule */}
                          <div className="mt-8 pt-6 border-t border-gray-100">
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-6">
                              <label className="flex items-center gap-3 cursor-pointer mb-6 group">
                                <input type="checkbox" {...register("slabConfig.dynamicIncrement.enabled")} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"/>
                                <div>
                                  <div className="font-bold text-gray-900 group-hover:text-blue-700 flex items-center gap-2">
                                    <Calculator size={18} className="text-blue-600"/>
                                    Dynamic Cost Calculation
                                  </div>
                                  <div className="text-xs text-gray-500">Add extra cost for amounts exceeding threshold</div>
                                </div>
                              </label>
                              
                              <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${!isDynamicEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Above Amount</label>
                                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span><input type="number" {...register("slabConfig.dynamicIncrement.thresholdAmount")} className="w-full pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"/></div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Base Rate</label>
                                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span><input type="number" {...register("slabConfig.dynamicIncrement.baseRate")} className="w-full pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"/></div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Every Extra</label>
                                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span><input type="number" {...register("slabConfig.dynamicIncrement.everyAmount")} className="w-full pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"/></div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Add Cost</label>
                                  <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">+</span><input type="number" {...register("slabConfig.dynamicIncrement.addRate")} className="w-full pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"/></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {courierType === 'freeshipping' && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      <div className="bg-gradient-to-r from-amber-50 to-white px-6 py-4 border-b border-amber-200">
                        <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                          <Gift size={20}/> Free Shipping Threshold
                        </h3>
                        <p className="text-xs text-amber-600 mt-0.5">Automatically apply free shipping above this amount</p>
                      </div>
                      <div className="p-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Minimum Order Amount
                        </label>
                        <div className="relative max-w-xs">
                          <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500" size={18}/>
                          <input 
                            type="number"
                            placeholder="500"
                            {...register("freeShippingAmount", { required: "Amount is required" })}
                            className="w-full pl-11 pr-4 py-3 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                          <Info size={12}/>
                          Orders above this amount will show "Free Shipping" at checkout
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex-none px-8 py-5 border-t border-gray-200 bg-white flex justify-end gap-4">
                <button onClick={handleCloseModal} className="px-6 py-2.5 font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                {/* ✅ Added error handler to onClick */}
                <button onClick={handleSubmit(onSubmit, onError)} disabled={isSubmitting} className="bg-emerald-600 text-white font-bold px-8 py-2.5 rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2">
                  {isSubmitting ? "Saving..." : <><Save size={20}/> Save Configuration</>}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ShippingManager;
