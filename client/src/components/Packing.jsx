import { useContext, useState, useEffect, useRef, useCallback } from "react"
import api from "../utils/axios"
import { ToastContainer, toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { AuthContext } from "../context/AuthContext"
import HashLoader from "react-spinners/HashLoader"
import { Html5Qrcode } from "html5-qrcode"
import { Package } from 'lucide-react'

const Packing = () => {
  const { tenant, user, token } = useContext(AuthContext)

  // Packing State
  const [orderNumber, setOrderNumber] = useState("")
  const [products, setProducts] = useState([])
  const [skuInput, setSkuInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [customerNote, setCustomerNote] = useState("")
  const [verifiedSkus, setVerifiedSkus] = useState([])
  const [productsFetched, setProductsFetched] = useState(false)
  const [packingComplete, setPackingComplete] = useState(false)

  // Data State
  const [packingStats, setPackingStats] = useState({
    totalOrders: 0,
    packedOrders: 0,
    unpackedOrders: 0,
    completedOrders: 0,
    processingOrders: 0,
  })
  const [ordersForPacking, setOrdersForPacking] = useState([])
  const [showOrdersList, setShowOrdersList] = useState(false)
  
  // UI/Scanner State
  const [isMobile, setIsMobile] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanType, setScanType] = useState(null)

  // Initialize from LocalStorage
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(() => {
    const saved = localStorage.getItem('packing_notify_status');
    return saved === 'true'; 
  });

  const skuInputRef = useRef(null)
  const orderInputRef = useRef(null)
  const html5QrCode = useRef(null)
  const isStartingRef = useRef(false)

  // Mobile Detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Helper: Auth Headers
  const getTenantId = useCallback(() => {
    const tenantId = user?.tenant_id || user?.tenantId || user?.tenant?.id || tenant?.id || tenant?.tenantId
    if (!tenantId) {
      toast.error("Tenant information not available.")
      return null
    }
    return tenantId
  }, [user, tenant])

  const getAuthToken = useCallback(() => {
    const authToken = token || localStorage.getItem("token") || sessionStorage.getItem("token")
    if (!authToken) {
      toast.error("Authentication token not found.")
      return null
    }
    return authToken
  }, [token])

  const getAuthHeaders = useCallback(() => {
    const authToken = getAuthToken()
    const tenantId = getTenantId()
    if (!authToken || !tenantId) return null
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-tenant-id": tenantId,
    }
  }, [getAuthToken, getTenantId])

  // --- API CALLS ---
  const fetchPackingStats = async () => {
    const headers = getAuthHeaders()
    if (!headers) return
    try {
      const tenantId = getTenantId()
      const response = await api.get("/api/packing/packing-stats", { params: { tenantId }, headers })
      setPackingStats(response.data)
    } catch (error) {
      console.error("Error fetching stats:", error)
    }
  }

  const fetchOrdersForPacking = async () => {
    const headers = getAuthHeaders()
    if (!headers) return
    try {
      const tenantId = getTenantId()
      const response = await api.get("/api/packing/orders-for-packing", { params: { tenantId, per_page: 20 }, headers })
      setOrdersForPacking(response.data.orders || [])
    } catch (error) {
      console.error("Error fetching orders:", error)
    }
  }

  // Toggle Function saves to LocalStorage AND Database
  const toggleNotification = async (newValue) => {
    // 1. Update UI Immediately
    setIsNotificationEnabled(newValue)
    
    // 2. Save to Browser Storage
    localStorage.setItem('packing_notify_status', newValue);

    // 3. Show Toast for Toggle Status
    toast.info(`Notifications turned ${newValue ? 'ON' : 'OFF'}`, { autoClose: 1500 });

    const headers = getAuthHeaders()
    if (!headers) return

    try {
      // 4. Sync with Backend
      const tenantId = getTenantId()
      await api.post(`/api/settings/toggle-automation`, {
        tenantId,
        type: 'packing',
        enabled: newValue
      }, { headers })
    } catch (error) {
      console.error("Failed to sync setting with server", error);
    }
  }

  const handleApiError = (error, action) => {
    console.error(`Error ${action}:`, error)
    if (error.response) {
      const data = error.response.data
      toast.error(data?.error || `Error ${action}`)
    } else {
      toast.error(`Error ${action}. Server may be unreachable.`)
    }
  }

  useEffect(() => {
  if (!getAuthToken() || !getTenantId()) {
    toast.error("Please login to use the packing system")
    return
  }
  fetchPackingStats()
  fetchOrdersForPacking()
  
  const syncSettings = async () => {
    const headers = getAuthHeaders();
    const tenantId = getTenantId();
    if(headers && tenantId) {
      try {
        const response = await api.get(`/api/settings/automation-config`, {
          params: { tenantId, type: 'packing' },
          headers
        });
        if (response.data && response.data.packing) {
          const dbEnabled = response.data.packing.enabled;
          
          // ✅ Only sync if localStorage is empty (first visit)
          const localValue = localStorage.getItem('packing_notify_status');
          if (localValue === null) {
            setIsNotificationEnabled(dbEnabled);
            localStorage.setItem('packing_notify_status', dbEnabled);
          }
        }
      } catch(e) { console.error("Could not sync settings", e); }
    }
  }
  syncSettings();

  }, [getAuthToken, getTenantId])

  // --- SCANNER LOGIC ---
  const stopScanner = useCallback(async () => {
    if (!html5QrCode.current) return
    try {
      await html5QrCode.current.stop()
    } catch (error) {
      console.log("Scanner stop error (safe to ignore):", error?.message || error)
    }
    try {
      html5QrCode.current.clear()
    } catch (_error) {
      // ignore
    }
    html5QrCode.current = null
  }, [])

  const handleCloseScanner = useCallback(async () => {
    await stopScanner()
    setScanning(false)
    setScanType(null)
    isStartingRef.current = false
  }, [stopScanner])

  useEffect(() => {
    let mounted = true

    const initScanner = async () => {
      if (!scanning || isStartingRef.current) return

      isStartingRef.current = true
      await stopScanner()
      await new Promise((resolve) => setTimeout(resolve, 250))

      if (!mounted) {
        isStartingRef.current = false
        return
      }

      const readerElement = document.getElementById("reader")
      if (!readerElement) {
        console.error("Reader element not found!")
        toast.error("Scanner initialization failed")
        handleCloseScanner()
        return
      }

      try {
        html5QrCode.current = new Html5Qrcode("reader")
        const config = { fps: 10, qrbox: { width: 250, height: 250 } }

        await html5QrCode.current.start(
          { facingMode: isMobile ? "environment" : "user" },
          config,
          (decodedText) => {
            if (!mounted) return

            if (scanType === "order") {
              setOrderNumber(decodedText)
              handleCloseScanner()
              setTimeout(() => fetchProducts(decodedText), 300)
            } else if (scanType === "sku") {
              setSkuInput(decodedText)
              handleCloseScanner()
              setTimeout(() => handleSkuSubmit(decodedText), 300)
            }
          },
          () => { }
        )
      } catch (error) {
        console.error("Scanner error:", error)
        const errorMsg = error?.message || ""
        if (errorMsg.toLowerCase().includes("permission")) {
          toast.error("Camera permission denied.")
        } else if (errorMsg.toLowerCase().includes("notfounderror")) {
          toast.error("No camera found.")
        } else {
          toast.error("Camera failed. Check permissions.")
        }
        handleCloseScanner()
      } finally {
        isStartingRef.current = false
      }
    }

    initScanner()

    return () => {
      mounted = false
      stopScanner().catch(() => { })
      isStartingRef.current = false
    }
  }, [scanning, scanType, isMobile, handleCloseScanner, stopScanner])

  // --- CORE PACKING FUNCTIONS ---
  const startOrderScanner = () => {
    setScanType("order")
    setScanning(true)
  }

  const startSkuScanner = () => {
    setScanType("sku")
    setScanning(true)
  }

  const fetchProducts = async (orderNum = orderNumber) => {
    const headers = getAuthHeaders()
    if (!headers) return

    setLoading(true)
    setProductsFetched(false)
    setPackingComplete(false)

    try {
      const tenantId = getTenantId()
      const response = await api.post(`/api/packing/fetch-products/${orderNum}`, { tenantId }, { headers })

      const productsWithInitialQty = response.data.products.map(p => ({ ...p, initialQuantity: p.quantity }));

      setProducts(productsWithInitialQty || [])
      setCustomerNote(response.data.customerNote || "")
      setVerifiedSkus([])
      setProductsFetched(true)
      setOrderNumber(orderNum)
      setShowOrdersList(false)

      // No toast here to keep it clean, or optional: toast.success(`Order loaded`)
    } catch (error) {
      handleApiError(error, "fetching order")
      resetForm()
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setProducts([])
    setCustomerNote("")
    setVerifiedSkus([])
    setProductsFetched(false)
    setPackingComplete(false)
  }

  const handleFetchClick = () => {
    if (orderNumber.trim()) fetchProducts()
    else if (isMobile) startOrderScanner()
    else toast.warning("Enter Order Number")
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && orderNumber.trim()) fetchProducts()
  }

  const handleSkuSubmit = (customSku = null) => {
    const skuToUse = customSku || skuInput.trim()

    if (!skuToUse) {
      toast.warning("Enter or Scan SKU")
      return
    }

    const productIndex = products.findIndex((product) =>
      product.sku === skuToUse || product.retailerId === skuToUse || `SKU-${product.id}` === skuToUse
    )

    if (productIndex !== -1) {
      const updatedProducts = [...products]
      const currentQuantity = updatedProducts[productIndex].quantity
      
      if (currentQuantity > 1) {
        updatedProducts[productIndex].quantity -= 1
      } else {
        updatedProducts.splice(productIndex, 1)
      }

      setProducts(updatedProducts)
      const newVerifiedSkus = [...verifiedSkus, skuToUse]
      setVerifiedSkus(newVerifiedSkus)
      setSkuInput("")

      if (updatedProducts.length === 0) {
        handleAllProductsVerified(newVerifiedSkus)
      }
    } else {
      toast.error("❌ Wrong SKU!")
      setSkuInput("")
    }
  }

  const handleAllProductsVerified = async (allVerifiedSkus) => {
    const headers = getAuthHeaders()
    if (!headers) return

    try {
      setLoading(true)
      setPackingComplete(true)

      const tenantId = getTenantId()

      const requestPayload = {
        tenantId,
        skus: allVerifiedSkus,
        skuInputs: allVerifiedSkus,
        sendNotification: isNotificationEnabled
      }

      await api.post(`/api/packing/verify-sku/${orderNumber}`, requestPayload, { headers })

      // Refresh Stats
      fetchPackingStats()
      fetchOrdersForPacking()

      // ✅ AUTOMATICALLY GO TO NEXT ORDER
      // Short delay to show the complete state briefly
      setTimeout(() => {
        handleStartNewOrder()
      }, 1500) 

    } catch (error) {
      setPackingComplete(false)
      handleApiError(error, "completing order") // Shows error toast if something fails
    } finally {
      setLoading(false)
    }
  }

  const handleSkuKeyPress = (e) => {
    if (e.key === "Enter") handleSkuSubmit()
  }

  const handleStartNewOrder = () => {
    setOrderNumber("")
    setSkuInput("")
    setProducts([])
    setCustomerNote("")
    setVerifiedSkus([])
    setProductsFetched(false)
    setPackingComplete(false)
    if (!isMobile && orderInputRef.current) orderInputRef.current.focus()
  }

  const getProgressPercentage = () => {
    if (!productsFetched) return 0;
    const initialTotal = products.reduce((sum, p) => sum + (p.initialQuantity || 0), 0) + verifiedSkus.length;
    if (initialTotal === 0) return 0;
    return (verifiedSkus.length / initialTotal) * 100
  }

  if (!getAuthToken() || !getTenantId()) return null

  return (
    <div className={`w-full min-h-screen bg-gradient-to-b from-emerald-50 to-white text-gray-800 flex justify-center p-3 md:p-4 ${isMobile ? "items-start" : "items-center"}`}>
      <ToastContainer position="top-right" autoClose={2000} hideProgressBar={true} />

      <div className={`w-full mx-auto ${isMobile ? "max-w-md" : "max-w-4xl"}`}>
        <div className={`bg-white rounded-xl md:rounded-2xl shadow-lg md:shadow-xl border border-emerald-100 ${isMobile ? "overflow-hidden" : "p-4 md:p-8 lg:p-12"}`}>

          {/* --- HEADER --- */}
          {isMobile ? (
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-5 text-center">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Package className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Packing Module</h1>
              <p className="text-emerald-100 text-sm mt-1">Verify items and complete order packing</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 gap-4">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-800">Packing Module</h1>
              <div className="flex items-center gap-3 md:gap-4">
                 <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 shadow-sm">
                    <span className="text-xs md:text-sm font-semibold text-emerald-700">Notify:</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isNotificationEnabled}
                        onChange={(e) => toggleNotification(e.target.checked)}
                      />
                      <div className="w-10 h-5 md:w-11 md:h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 md:after:h-5 md:after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                 </div>

                 <span className={`text-xs md:text-sm font-medium px-3 py-1.5 md:px-4 md:py-2 rounded-full border ${productsFetched ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                   {productsFetched ? 'Active' : 'Idle'}
                 </span>
              </div>
            </div>
          )}

          <div className={isMobile ? "p-4 space-y-4" : ""}>
            {isMobile && (
              <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
                <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 shadow-sm">
                  <span className="text-xs md:text-sm font-semibold text-emerald-700">Notify:</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isNotificationEnabled}
                      onChange={(e) => toggleNotification(e.target.checked)}
                    />
                    <div className="w-10 h-5 md:w-11 md:h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 md:after:h-5 md:after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <span className={`text-xs md:text-sm font-medium px-3 py-1.5 md:px-4 md:py-2 rounded-full border ${productsFetched ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  {productsFetched ? 'Active' : 'Idle'}
                </span>
              </div>
            )}

            {/* --- ORDER INPUT --- */}
            <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 mb-6 md:mb-8">
            <div className="relative w-full">
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                className="w-full bg-white border-2 border-gray-200 rounded-lg p-3 pr-12 md:p-4 text-base md:text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition duration-200"
                placeholder="Enter or scan Order Number"
                ref={orderInputRef}
                disabled={loading || scanning}
              />
              <button
                onClick={startOrderScanner}
                disabled={loading || scanning}
                className="absolute inset-y-0 right-0 flex items-center pr-3 md:pr-4 text-gray-500 hover:text-emerald-600"
                aria-label="Scan order number"
                type="button"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a2 2 0 002-2V5a2 2 0 00-2-2H5v2z" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleFetchClick}
              disabled={loading || scanning || !orderNumber.trim()}
              className="w-full md:w-auto bg-emerald-600 text-white font-semibold px-6 py-3 md:px-10 md:py-4 text-base md:text-lg rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg duration-200"
            >
              {loading ? "Fetching..." : "Fetch Products"}
            </button>
          </div>

          {/* --- PROGRESS BAR --- */}
          <div className="mb-6 md:mb-8 bg-white p-3 md:p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-2 text-sm md:text-base font-medium text-gray-700">
              <span>Packing Progress</span>
              <span className="text-emerald-600">{Math.round(getProgressPercentage())}%</span>
            </div>
            <div className="w-full bg-gray-100 h-2.5 md:h-3 lg:h-4 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${getProgressPercentage()}%` }}></div>
            </div>
            <div className="flex justify-between items-center mt-3 md:mt-4">
                <span className="text-xs md:text-sm font-medium text-gray-500">Remaining: <strong className="text-gray-800">{products.reduce((sum, p) => sum + p.quantity, 0)}</strong></span>
                <span className="text-xs md:text-sm font-medium text-gray-500">Packed: <strong className="text-emerald-600">{verifiedSkus.length}</strong></span>
            </div>
          </div>

          {/* --- CONTENT AREA --- */}
          {loading ? (
          <div className="flex flex-col items-center justify-center h-48 md:h-64 border-t border-gray-100 pt-6 md:pt-8">
            <HashLoader color="#10B981" size={50} />
            <p className="mt-3 md:mt-4 text-gray-500 text-base md:text-lg animate-pulse">Processing...</p>
          </div>
        ) : (
          <div className="space-y-4 md:space-y-6">

            {/* Product List */}
            {products.length > 0 && (
              <div className="border-t border-gray-100 pt-6 md:pt-8">
                <h3 className="text-base md:text-lg font-semibold text-gray-700 mb-3 md:mb-4">Items to Pack</h3>
                <div className="space-y-2 md:space-y-3">
                  {products.map((product, index) => (
                    <div key={index} className="flex justify-between items-center text-sm md:text-base bg-emerald-50 p-3 md:p-4 rounded-lg border border-emerald-200 hover:border-emerald-300 transition-colors duration-200">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800">{product.name}</span>
                        <span className="text-xs text-gray-500">SKU: {product.sku}</span>
                      </div>
                      <span className="bg-white text-emerald-700 border border-emerald-200 font-bold px-3 py-1.5 md:px-4 md:py-2 rounded-lg shadow-sm">
                        Qty: {product.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SKU Verification Input */}
            {products.length > 0 && !packingComplete && (
              <div className="border-t border-gray-100 pt-6 md:pt-8">
                <label className="text-lg md:text-xl font-semibold mb-3 md:mb-4 block text-gray-800">Scan Product SKU</label>
                <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4">
                  <div className="relative w-full">
                    <input
                      type="text"
                      value={skuInput}
                      onChange={(e) => setSkuInput(e.target.value)}
                      onKeyPress={handleSkuKeyPress}
                      onFocus={(e) => e.target.style.borderColor = '#10b981'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                      className="w-full bg-white border-2 border-gray-200 rounded-lg p-3 pr-12 md:p-4 text-base md:text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition duration-200 shadow-sm"
                      placeholder="Scan SKU or Enter Manually"
                      ref={skuInputRef}
                      disabled={loading || scanning}
                    />
                    <button
                      onClick={startSkuScanner}
                      disabled={loading || scanning}
                      className="absolute inset-y-0 right-0 hidden md:flex items-center pr-3 text-gray-500 hover:text-emerald-600"
                      aria-label="Scan SKU"
                      type="button"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a2 2 0 002-2V5a2 2 0 00-2-2H5v2z" />
                      </svg>
                    </button>
                  </div>
                   {isMobile && (
                    <button
                      onClick={startSkuScanner}
                      disabled={loading || scanning}
                      className="w-full bg-emerald-600 text-white p-3 md:p-4 rounded-lg hover:bg-emerald-700 shadow-md font-medium"
                    >
                      📷 Scan
                    </button>
                  )}
                  <button
                    onClick={() => handleSkuSubmit()}
                    disabled={loading || !skuInput.trim() || scanning}
                    className="w-full md:w-auto bg-emerald-600 text-white font-semibold px-6 py-3 md:px-10 md:py-4 text-base md:text-lg rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all shadow-md duration-200"
                  >
                    Verify
                  </button>
                </div>
              </div>
            )}

            {/* Success State */}
            {packingComplete && (
              <div className="border-t border-gray-100 pt-8 md:pt-10 text-center animate-fade-in-up">
                <div className="text-6xl md:text-7xl mb-4 md:mb-6">📦✨</div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">Packing Complete!</h2>
                <p className="text-base md:text-lg text-gray-600 mb-4 md:mb-6">Order <span className="font-semibold text-gray-900">{orderNumber}</span> verified.</p>
                <p className="text-sm text-gray-400">Loading next order...</p>
              </div>
            )}

            {/* Empty State */}
            {productsFetched && products.length === 0 && verifiedSkus.length === 0 && !packingComplete && (
              <div className="border-t border-gray-100 pt-6 md:pt-8 text-center">
                <div className="text-4xl md:text-5xl mb-3 md:mb-4 grayscale opacity-50">🔍</div>
                <p className="text-lg md:text-xl text-gray-700 font-medium mb-2">No products found.</p>
                <p className="text-sm md:text-base text-gray-500 mb-3 md:mb-4">This order may already be packed.</p>
                <button onClick={() => setShowOrdersList(true)} className="text-emerald-600 font-semibold hover:underline text-sm md:text-base">
                  View Available Orders
                </button>
              </div>
            )}

            {/* Customer Note */}
            {customerNote && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 md:p-4 mt-4 md:mt-6 rounded-r-lg shadow-sm">
                <p className="text-base md:text-lg text-yellow-800"><span className="font-bold mr-2">📝 Note:</span> {customerNote}</p>
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>

      {/* Camera Scanner Overlay */}
      {scanning && (
          <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-sm aspect-video bg-black rounded-xl md:rounded-2xl overflow-hidden border-2 border-gray-700 shadow-2xl">
              <div id="reader" className="w-full h-full" onClick={(e) => e.preventDefault()}></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-emerald-500 rounded-lg opacity-50 pointer-events-none"></div>
              <p className="absolute bottom-3 md:bottom-4 left-0 right-0 text-center text-white text-xs md:text-sm font-medium bg-black/50 py-2">
                {scanType === "order" ? "Scan Order Barcode" : "Scan Product SKU"}
              </p>
            </div>
            <button onClick={handleCloseScanner} className="mt-6 md:mt-8 bg-white/10 backdrop-blur-md text-white px-6 py-2.5 md:px-8 md:py-3 rounded-full hover:bg-white/20 border border-white/20 font-medium transition-all duration-200">
              Cancel Scan
            </button>
          </div>
        )}

      <style jsx>{`
        #reader video {
          object-fit: cover;
          border-radius: 0.75rem;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

export default Packing

