import { useState, useEffect, useRef, useCallback } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { Camera, Package, Weight, Hash, Send, Truck } from 'lucide-react'
import { toast, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import axios from 'axios'

const Tracking = ({ onScannerStateChange }) => {
  const [formData, setFormData] = useState({
    orderId: "",
    trackingNumber: "",
    weight: "",
  })

  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [statusType, setStatusType] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const[scanning, setScanning] = useState(false)
  const [scanType, setScanType] = useState(null)
  const [scannerReady, setScannerReady] = useState(false)

  const html5QrCodeRef = useRef(null)
  
  // Refs for auto-focusing
  const orderInputRef = useRef(null)
  const trackingInputRef = useRef(null)
  const weightInputRef = useRef(null)
  
  const isStartingRef = useRef(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  },[])

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop()
        html5QrCodeRef.current.clear()
      } catch (error) {
        console.log("Scanner stop error (safe to ignore):", error.message)
      }
      html5QrCodeRef.current = null
    }
  },[])

  const handleCloseScanner = useCallback(async () => {
    await stopScanner()
    setScanning(false)
    setScannerReady(false)
    isStartingRef.current = false
    if (onScannerStateChange) onScannerStateChange(false)
  },[onScannerStateChange, stopScanner])

  const startScanning = async (type) => {
    if (isStartingRef.current || scanning) return
    await stopScanner()
    setScanType(type)
    setScanning(true)
    if (onScannerStateChange) onScannerStateChange(true)
  }

  useEffect(() => {
    let mounted = true

    const initScanner = async () => {
      if (!scanning || isStartingRef.current) return
      isStartingRef.current = true
      await new Promise(resolve => setTimeout(resolve, 300))
      if (!mounted) { isStartingRef.current = false; return }

      const readerElement = document.getElementById("reader")
      if (!readerElement) {
        console.error("Reader element not found!")
        isStartingRef.current = false
        toast.error("Scanner initialization failed")
        handleCloseScanner()
        return
      }

      try {
        html5QrCodeRef.current = new Html5Qrcode("reader")
        const config = { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.777 }
        await html5QrCodeRef.current.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (!mounted) return
            setFormData(prev => ({
              ...prev,[scanType === 'orderId' ? 'orderId' : 'trackingNumber']: decodedText
            }))
            toast.success(`✅ Scanned: ${decodedText}`)
            
            // Close scanner first
            handleCloseScanner()

            // Auto-focus the next field after a slight delay to allow overlay to close
            setTimeout(() => {
              if (scanType === 'orderId') {
                trackingInputRef.current?.focus()
              } else if (scanType === 'tracking') {
                weightInputRef.current?.focus()
              }
            }, 300)
          },
          () => {}
        )
        if (mounted) { setScannerReady(true); isStartingRef.current = false }
      } catch (error) {
        console.error("Scanner start error:", error)
        if (mounted) {
          const errorMsg = error.message || "Unknown error"
          if (errorMsg.includes("Permission")) toast.error("📷 Camera permission denied")
          else if (errorMsg.includes("NotFoundError")) toast.error("📷 No camera found")
          else toast.error("📷 Camera error: " + errorMsg)
          handleCloseScanner()
        }
        isStartingRef.current = false
      }
    }

    initScanner()
    return () => {
      mounted = false
      if (html5QrCodeRef.current) html5QrCodeRef.current.stop().catch(() => {})
    }
  }, [scanning, scanType, handleCloseScanner])

  // Handle Enter key for manual typing or handheld hardware scanners
  const handleKeyDown = (e, nextFieldRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextFieldRef && nextFieldRef.current) {
        nextFieldRef.current.focus();
      } else {
        // If there is no next field (Weight field), trigger submit
        sendTrackingNotification();
      }
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const sendTrackingNotification = async () => {
    if (!formData.orderId.trim()) {
      orderInputRef.current?.focus()
      return toast.warning("Order ID is required")
    }
    if (!formData.trackingNumber.trim()) {
      trackingInputRef.current?.focus()
      return toast.warning("Tracking Number is required")
    }
    
    setLoading(true)
    setStatusMessage("")
    try {
      const token = localStorage.getItem('token')
      const payload = {
        orderId: formData.orderId,
        trackingNumber: formData.trackingNumber,
        weight: formData.weight.trim(),
        courierService: "Standard"
      }
      const res = await axios.post('/api/tracking/send-notification', payload, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.success) {
        toast.success("Update Sent Successfully!")
        setStatusMessage("✅ Tracking sent successfully!")
        setStatusType("success")
        setTimeout(() => {
          setFormData({ orderId: "", trackingNumber: "", weight: "" })
          setStatusMessage("")
          if (orderInputRef.current) orderInputRef.current.focus()
        }, 1500)
      } else {
        setStatusMessage("❌ Failed: " + res.data.error)
        setStatusType("error")
      }
    } catch (error) {
      console.error(error)
      setStatusMessage("❌ Error: " + (error.response?.data?.error || "Connection failed"))
      setStatusType("error")
    } finally {
      setLoading(false)
    }
  }

  // ── Shared page content ───────────────────────────────────────────────────
  const pageContent = (
    <div className="w-full">
      <ToastContainer position="top-center" autoClose={2000} hideProgressBar={true} />

      {/* Scanner Overlay */}
      {scanning && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm relative">
            <div id="reader" className="w-full rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-2xl" style={{ minHeight: '280px' }} />
            <p className="text-white text-center mt-4 font-medium">
              {scannerReady ? <span className="animate-pulse">📷 Point at barcode...</span> : <span>Starting camera...</span>}
            </p>
            <p className="text-emerald-400 text-center text-sm mt-2">
              Scanning: {scanType === 'orderId' ? 'Order ID' : 'Tracking Number'}
            </p>
          </div>
          <button onClick={handleCloseScanner} className="mt-8 bg-white/10 text-white border border-white/20 px-8 py-3 rounded-full font-bold hover:bg-white/20 transition-all">
            ✕ Cancel
          </button>
        </div>
      )}

      {/* Main Card */}
      <div className={`bg-white w-full rounded-2xl shadow-sm overflow-hidden border border-emerald-100 transition-opacity duration-300 ${scanning ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-6 text-center">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <Truck className="w-6 h-6" /> Order Tracking
          </h1>
          <p className="text-emerald-100 text-sm mt-1">Send dispatch updates via WhatsApp</p>
        </div>

        <div className="p-4 space-y-4">
          {statusMessage && (
            <div className={`p-3 rounded-xl text-center text-sm font-semibold border ${statusType === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {statusMessage}
            </div>
          )}

          {/* Order ID */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Hash className="w-4 h-4 text-gray-400"/> Order ID <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input 
                ref={orderInputRef} 
                name="orderId" 
                value={formData.orderId} 
                onChange={handleInputChange}
                onKeyDown={(e) => handleKeyDown(e, trackingInputRef)}
                className="w-full pl-4 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all font-medium text-gray-800 placeholder-gray-400 text-sm"
                placeholder="e.g. 1015" 
              />
              <button type="button" onClick={() => startScanning('orderId')} disabled={scanning}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                <Camera className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tracking Number */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400"/> Tracking Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input 
                ref={trackingInputRef}
                name="trackingNumber" 
                value={formData.trackingNumber} 
                onChange={handleInputChange}
                onKeyDown={(e) => handleKeyDown(e, weightInputRef)}
                className="w-full pl-4 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all font-medium text-gray-800 placeholder-gray-400 text-sm"
                placeholder="e.g. CT550..." 
              />
              <button type="button" onClick={() => startScanning('tracking')} disabled={scanning}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                <Camera className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Weight */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Weight className="w-4 h-4 text-gray-400"/> Weight (Optional)
            </label>
            <input 
              ref={weightInputRef}
              name="weight" 
              value={formData.weight} 
              onChange={handleInputChange}
              onKeyDown={(e) => handleKeyDown(e, null)} // Pass null to trigger form submit on enter
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-gray-800 placeholder-gray-400 text-sm"
              placeholder="e.g. 0.5kg" 
            />
          </div>

          {/* Send Button */}
          <button onClick={sendTrackingNotification} disabled={loading}
            className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {loading ? "Sending..." : <><Send className="w-4 h-4" /> Send Update</>}
          </button>
        </div>
      </div>
    </div>
  )

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-full bg-[#f0fdf4] p-3">
        {pageContent}
      </div>
    )
  }

  // ── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {pageContent}
      </div>
    </div>
  )
}

export default Tracking
