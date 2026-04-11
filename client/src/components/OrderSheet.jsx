import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import OrderReportDownload from './OrderReportDownload';
import {
  Search,
  X,
  MapPin,
  User,
  Package,
  CreditCard,
  Truck,
  Edit2,
  Eye,
  Settings,
  RefreshCw,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle,
  Hash,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Info,
  ShoppingCart,
  FileText,
  Receipt,
  ChevronDown,
  Minus,
  Check,
  Clock,
  Loader2,
} from "lucide-react"
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const createEmptyManualItem = () => ({
  name: "",
  sku: "",
  retailerId: "",
  inventoryItemId: "",
  quantity: 1,
  price: ""
});

const getInitialManualOrderForm = () => ({
  customerDetails: {
    name: "",
    phone: "",
    email: ""
  },
  shippingAddress: {
    name: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India"
  },
  salesPersonName: "",
  paymentStatus: "pending",
  paymentMethod: "online",   // ✅ FIX: default is online
  shippingMethodId: "",
  shippingMethodName: "",
  shippingCost: "0",
  taxAmount: "0",
  discountAmount: "0",
  notes: "",
  items: [createEmptyManualItem()]
});

const normalizePaymentStatus = (status) => {
  const normalized = String(status || "").toLowerCase().trim();
  if (normalized === "paid" || normalized === "complete" || normalized === "completed") {
    return "completed";
  }
  if (["pending", "processing", "failed", "refunded", "tested"].includes(normalized)) {
    return normalized;
  }
  return "pending";
};

const OrderSheet = () => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("All Orders")

  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)
  const [addressForm, setAddressForm] = useState({})

  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState({ orderId: null, status: null });
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [manualOrderSubmitting, setManualOrderSubmitting] = useState(false);
  const [manualOrderForm, setManualOrderForm] = useState(getInitialManualOrderForm);
  const [manualInventoryCache, setManualInventoryCache] = useState([]);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [manualProductSuggestions, setManualProductSuggestions] = useState({});
  const [manualSuggestionContext, setManualSuggestionContext] = useState({ index: null, field: null });
  const [sendingPaymentConfirmation, setSendingPaymentConfirmation] = useState(false);

  const [isMobile, setIsMobile] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false);
  const productSearchTimeoutRef = useRef(null);
  const shippingCalcTimeoutRef = useRef(null);

  const [orderFilterType, setOrderFilterType] = useState("all")
  const [dateFilter, setDateFilter] = useState({
    enabled: false,
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  })

  const [showDateFilterModal, setShowDateFilterModal] = useState(false)
  const [tempStartDate, setTempStartDate] = useState(dateFilter.startDate)
  const [tempEndDate, setTempEndDate] = useState(dateFilter.endDate)

  const normalizeApiBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "")
  const getDefaultApiBaseUrl = () => {
    const envUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
    if (envUrl) return envUrl
    if (typeof window !== "undefined") {
      const host = window.location.hostname
      if (host === "localhost" || host === "127.0.0.1") {
        return "http://localhost:5000"
      }
    }
    return "https://bot.gowhats.in"
  }

  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = normalizeApiBaseUrl(localStorage.getItem("apiBaseUrl"))
      if (saved) return saved
    }
    return getDefaultApiBaseUrl()
  })

  const [showConfig, setShowConfig] = useState(false)

  const getApiBaseCandidates = () => {
    const candidates = []
    const seen = new Set()
    const addCandidate = (value) => {
      const normalized = normalizeApiBaseUrl(value)
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      candidates.push(normalized)
    }

    addCandidate(apiBaseUrl)
    addCandidate(import.meta.env.VITE_API_BASE_URL)

    if (typeof window !== "undefined") {
      const host = window.location.hostname
      if (host === "localhost" || host === "127.0.0.1") {
        addCandidate("http://localhost:5000")
      }
    }

    addCandidate("https://bot.gowhats.in")
    return candidates
  }

  const parseApiResponseBody = async (response) => {
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      return { data: await response.json(), isJson: true }
    }
    return { data: await response.text(), isJson: false }
  }

  const requestWithApiFallback = async (path, options = {}, config = {}) => {
    const { retryOn404 = true } = config
    const candidates = getApiBaseCandidates()
    let lastError = null

    for (let index = 0; index < candidates.length; index += 1) {
      const base = candidates[index]
      const hasNext = index < candidates.length - 1

      try {
        const response = await fetch(`${base}${path}`, options)
        const { data, isJson } = await parseApiResponseBody(response)

        if (response.ok) {
          if (base !== apiBaseUrl) {
            setApiBaseUrl(base)
            if (typeof window !== "undefined") {
              localStorage.setItem("apiBaseUrl", base)
            }
          }
          return { response, data, base, isJson }
        }

        const shouldRetry = retryOn404 && response.status === 404 && hasNext
        if (shouldRetry) continue

        const errorMessage = isJson
          ? (data?.error || data?.message || `Request failed (${response.status})`)
          : (typeof data === "string" && data.trim().startsWith("<!DOCTYPE")
            ? `Request failed (${response.status}) - check API base URL`
            : `Request failed (${response.status})`)

        const error = new Error(errorMessage)
        error.status = response.status
        error.data = data
        throw error
      } catch (error) {
        lastError = error
        if (!hasNext || (error && typeof error.status === "number")) {
          throw error
        }
      }
    }

    throw lastError || new Error("Request failed")
  }

  useEffect(() => {
    const checkMobile = () => {
      const isMobileView = window.innerWidth < 1024
      setIsMobile(isMobileView)
      if (isMobileView) setItemsPerPage(5)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => { fetchOrders() }, [apiBaseUrl])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterStatus, orderFilterType, dateFilter])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      setError(null)
      const headers = getAuthHeaders()
      if (!headers) throw new Error("Authentication token not found.")

      const { data } = await requestWithApiFallback(
        "/api/orders?limit=1000&includeRegistrations=false",
        { method: "GET", headers }
      )

      let ordersArray = []
      if (data.orders && Array.isArray(data.orders)) ordersArray = data.orders
      else if (Array.isArray(data)) ordersArray = data
      else if (data.data && Array.isArray(data.data)) ordersArray = data.data

      const processedOrders = ordersArray
        .map((order) => ({
          id: order._id || order.id,
          orderId: order.orderId || order.orderNumber || "N/A",
          orderNumber: order.orderNumber || order.orderId || "N/A",
          customerPhone: order.customerPhone || "N/A",
          customerDetails: {
            name: order.customerDetails?.name || order.customerName || "Unknown Customer",
            email: order.customerDetails?.email || "",
            phone: order.customerDetails?.phone || "N/A",
          },
          shippingAddress: order.shippingAddress || {},
          items: order.items || [],
          orderAmount: order.orderAmount || 0,
          shippingCost: order.shippingCost || 0,
          totalAmount: order.totalAmount || 0,
          currency: order.currency || "INR",
          status: order.status || "pending",
          paymentStatus: normalizePaymentStatus(order.paymentStatus),
          paymentMethod: order.paymentMethod || "N/A",
          salesPersonName: order.salesPersonName || "",
          shippingMethodName: order.metadata?.shippingMethodSelected || "",
          createdAt: order.createdAt || new Date().toISOString(),
          source: order.source || "whatsapp",
          paymentDetails: order.paymentDetails || {},
          paidAt: order.paymentDetails?.paidAt
            || (normalizePaymentStatus(order.paymentStatus) === "completed" ? order.updatedAt : null)
            || null,
          trackingNumber: order.metadata?.trackingInfo?.trackingNumber ||
                          order.metadata?.trackingHistory?.[0]?.trackingNumber ||
                          "N/A",
          trackedAt: order.metadata?.trackingInfo?.lastUpdatedAt,
          printedAt: order.printedAt,
          packedAt: order.packedAt,
          onHoldAt: order.onHoldAt,
          orderCategory: getOrderCategory(order.status),
          orderDate: order.createdAt || new Date().toISOString(),
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      setOrders(processedOrders)
    } catch (error) {
      console.error("Error fetching orders:", error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const getOrderCategory = (status) => {
    const statusLower = status?.toLowerCase() || "pending"
    if (["delivered", "shipped", "tracked"].includes(statusLower)) return "completed"
    if (["cancelled", "refunded", "returned"].includes(statusLower)) return "cancelled"
    return "pending"
  }

  const safeNumber = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
  }

  const manualOrderSummary = useMemo(() => {
    const subtotal = manualOrderForm.items.reduce((sum, item) => {
      const qty = Math.max(1, safeNumber(item.quantity))
      const price = Math.max(0, safeNumber(item.price))
      return sum + (qty * price)
    }, 0)

    const shippingCost = Math.max(0, safeNumber(manualOrderForm.shippingCost))
    const taxAmount = Math.max(0, safeNumber(manualOrderForm.taxAmount))
    const discountAmount = Math.max(0, safeNumber(manualOrderForm.discountAmount))
    const total = Math.max(subtotal + shippingCost + taxAmount - discountAmount, 0)

    return { subtotal, shippingCost, taxAmount, discountAmount, total }
  }, [manualOrderForm])

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken")
    if (!token) return null
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  }

  const getProductSku = (item) =>
    String(item?.retailer_id || item?.retailerId || item?.sku || "").trim()

  const buildShippingFallbackOptions = (methods = []) =>
    methods.map((method) => ({
      methodId: method._id,
      methodName: method.methodName,
      shippingCost: Number(method.fixedShippingRate || 0),
      courierType: method.courierType,
      estimatedDeliveryTime: method.estimatedDeliveryTime,
      supportsCOD: method.supportsCOD
    }))

  const filterInventorySuggestions = (items, query, limit = 8) => {
    const trimmed = String(query || "").trim().toLowerCase()
    if (trimmed.length < 2) return []

    const startsWith = []
    const contains = []

    for (const item of items || []) {
      const name = String(item?.name || "").toLowerCase()
      const sku = getProductSku(item).toLowerCase()
      const match = name.includes(trimmed) || sku.includes(trimmed)
      if (!match) continue

      if (name.startsWith(trimmed) || sku.startsWith(trimmed)) {
        startsWith.push(item)
      } else {
        contains.push(item)
      }
    }

    return [...startsWith, ...contains].slice(0, limit)
  }

  const loadManualInventoryCache = async () => {
    const headers = getAuthHeaders()
    if (!headers || !showManualOrderModal) return []
    if (manualInventoryCache.length > 0) return manualInventoryCache

    try {
      const { data } = await requestWithApiFallback("/api/inventory", { method: "GET", headers })
      const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
      if (items.length > 0) setManualInventoryCache(items)
      return items
    } catch (error) {
      console.error("Inventory cache load error:", error)
      return []
    }
  }

  const loadShippingMethods = async () => {
    const headers = getAuthHeaders()
    if (!headers || !showManualOrderModal) return

    try {
      const { data } = await requestWithApiFallback("/api/shipping/methods", { method: "GET", headers })
      const methods = Array.isArray(data.methods) ? data.methods : []
      setShippingMethods(methods)
      if (methods.length > 0) {
        const baseOptions = buildShippingFallbackOptions(methods)
        setShippingOptions((prev) => (prev.length > 0 ? prev : baseOptions))
      } else {
        setShippingOptions([])
      }
    } catch (error) {
      console.error("Shipping methods load error:", error)
    }
  }

  const fetchProductSuggestions = async (index, query) => {
    const trimmed = String(query || "").trim()
    if (trimmed.length < 2) {
      setManualProductSuggestions((prev) => ({ ...prev, [index]: [] }))
      return
    }

    const headers = getAuthHeaders()
    if (!headers) return

    try {
      const { data } = await requestWithApiFallback(
        `/api/inventory/search?q=${encodeURIComponent(trimmed)}&limit=8`,
        { method: "GET", headers }
      )
      const endpointSuggestions = Array.isArray(data.items) ? data.items : []
      let cacheSource = manualInventoryCache
      if (cacheSource.length === 0) cacheSource = await loadManualInventoryCache()
      const fallback = filterInventorySuggestions(cacheSource, trimmed, 8)
      const mergedSuggestions = [...endpointSuggestions, ...fallback].reduce((acc, item) => {
        const identity = String(item?._id || `${item?.name || ""}-${getProductSku(item)}`)
        if (acc.seen.has(identity)) return acc
        acc.seen.add(identity)
        acc.items.push(item)
        return acc
      }, { seen: new Set(), items: [] }).items.slice(0, 8)

      setManualProductSuggestions((prev) => ({ ...prev, [index]: mergedSuggestions }))
    } catch (error) {
      console.error("Product search error:", error)
      let cacheSource = manualInventoryCache
      if (cacheSource.length === 0) cacheSource = await loadManualInventoryCache()
      const fallback = filterInventorySuggestions(cacheSource, trimmed, 8)
      setManualProductSuggestions((prev) => ({ ...prev, [index]: fallback }))
    }
  }

  const handleManualItemAutocomplete = (index, field, value) => {
    handleManualItemChange(index, field, value)
    setManualSuggestionContext({ index, field })

    if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current)
    productSearchTimeoutRef.current = setTimeout(() => {
      fetchProductSuggestions(index, value)
    }, 250)
  }

  const applySuggestedProduct = (index, product) => {
    setManualOrderForm((prev) => {
      const nextItems = [...prev.items]
      const existing = nextItems[index] || createEmptyManualItem()
      const selectedSku = getProductSku(product)
      nextItems[index] = {
        ...existing,
        name: product.name || existing.name,
        sku: selectedSku || existing.sku,
        retailerId: selectedSku || existing.retailerId || "",
        inventoryItemId: product._id || existing.inventoryItemId || "",
        price: product.price !== undefined && product.price !== null
          ? String(product.price)
          : existing.price
      }
      return { ...prev, items: nextItems }
    })

    setManualProductSuggestions((prev) => ({ ...prev, [index]: [] }))
    setManualSuggestionContext({ index: null, field: null })
  }

  const fetchShippingOptions = async () => {
    const customerPhone = manualOrderForm.customerDetails.phone.trim()
    const state = manualOrderForm.shippingAddress.state.trim()
    const headers = getAuthHeaders()

    if (!headers || !showManualOrderModal) return
    const fallbackOptions = buildShippingFallbackOptions(shippingMethods)

    if (manualOrderSummary.subtotal <= 0 || !customerPhone || state.length < 2) {
      setShippingOptions(fallbackOptions)
      if (
        manualOrderForm.shippingMethodId &&
        !fallbackOptions.some((opt) => String(opt.methodId) === String(manualOrderForm.shippingMethodId))
      ) {
        setManualOrderForm((prev) => ({ ...prev, shippingMethodId: "", shippingMethodName: "" }))
      }
      setShippingError("")
      return
    }

    try {
      setShippingLoading(true)
      setShippingError("")

      const itemCount = manualOrderForm.items.reduce((sum, item) => sum + Math.max(1, safeNumber(item.quantity)), 0)

      const { data } = await requestWithApiFallback("/api/shipping/calculate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerPhone,
          orderDetails: {
            orderAmount: manualOrderSummary.subtotal,
            currency: "INR",
            itemCount: Math.max(1, itemCount),
            packageWeight: 0.5
          },
          customerAddress: {
            state: manualOrderForm.shippingAddress.state,
            city: manualOrderForm.shippingAddress.city,
            pincode: manualOrderForm.shippingAddress.pincode,
            country: manualOrderForm.shippingAddress.country || "India"
          }
        })
      })
      const options = Array.isArray(data.shippingOptions) ? data.shippingOptions : []
      const nextOptions = options.length > 0 ? options : fallbackOptions
      setShippingOptions(nextOptions)

      if (manualOrderForm.shippingMethodId) {
        const stillExists = nextOptions.some((opt) => String(opt.methodId) === String(manualOrderForm.shippingMethodId))
        if (!stillExists) {
          setManualOrderForm((prev) => ({ ...prev, shippingMethodId: "", shippingMethodName: "" }))
        }
      }
    } catch (error) {
      console.error("Shipping option fetch error:", error)
      setShippingOptions(fallbackOptions)
      setShippingError(error.message || "Failed to load shipping options")
    } finally {
      setShippingLoading(false)
    }
  }

  const handleManualFieldChange = (section, field, value) => {
    setManualOrderForm((prev) => {
      const updated = {
        ...prev,
        [section]: { ...prev[section], [field]: value }
      }

      if (section === "customerDetails" && field === "name") {
        if (!prev.shippingAddress.name) {
          updated.shippingAddress = { ...updated.shippingAddress, name: value }
        }
      }
      if (section === "customerDetails" && field === "phone") {
        if (!prev.shippingAddress.phone) {
          updated.shippingAddress = { ...updated.shippingAddress, phone: value }
        }
      }

      return updated
    })
  }

  const handleManualTopLevelChange = (field, value) => {
    setManualOrderForm((prev) => ({
      ...prev,
      [field]: field === "paymentStatus" ? normalizePaymentStatus(value) : value
    }))
  }

  const handleManualItemChange = (index, field, value) => {
    setManualOrderForm((prev) => {
      const nextItems = [...prev.items]
      nextItems[index] = {
        ...nextItems[index],
        [field]: field === "quantity" ? Math.max(1, Number(value) || 1) : value
      }
      return { ...prev, items: nextItems }
    })
  }

  const addManualItem = () => {
    setManualOrderForm((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyManualItem()]
    }))
  }

  const removeManualItem = (index) => {
    setManualOrderForm((prev) => {
      if (prev.items.length <= 1) return prev
      const nextItems = prev.items.filter((_, i) => i !== index)
      return { ...prev, items: nextItems }
    })
    setManualProductSuggestions({})
    setManualSuggestionContext({ index: null, field: null })
  }

  const closeManualOrderModal = () => {
    setShowManualOrderModal(false)
    setManualOrderForm(getInitialManualOrderForm())
    setShippingOptions([])
    setShippingError("")
    setManualProductSuggestions({})
    setManualSuggestionContext({ index: null, field: null })
  }

  const openManualOrderModal = () => {
    setManualOrderForm(getInitialManualOrderForm())
    setShippingOptions([])
    setShippingError("")
    setManualProductSuggestions({})
    setManualSuggestionContext({ index: null, field: null })
    setShowManualOrderModal(true)
  }

  const handleShippingMethodSelect = (methodId) => {
    if (!methodId) {
      setManualOrderForm((prev) => ({ ...prev, shippingMethodId: "", shippingMethodName: "" }))
      return
    }

    const selected =
      shippingOptions.find((option) => String(option.methodId) === String(methodId)) ||
      shippingMethods.find((method) => String(method._id) === String(methodId))
    if (!selected) return

    setManualOrderForm((prev) => ({
      ...prev,
      shippingMethodId: String(selected.methodId || selected._id),
      shippingMethodName: selected.methodName || "",
      shippingCost: String(
        selected.shippingCost !== undefined && selected.shippingCost !== null
          ? selected.shippingCost
          : (selected.fixedShippingRate ?? 0)
      )
    }))
  }

  useEffect(() => {
    if (!showManualOrderModal) return
    loadShippingMethods()
    loadManualInventoryCache()
  }, [showManualOrderModal, apiBaseUrl])

  useEffect(() => {
    if (!showManualOrderModal) return

    if (shippingCalcTimeoutRef.current) clearTimeout(shippingCalcTimeoutRef.current)
    shippingCalcTimeoutRef.current = setTimeout(() => {
      fetchShippingOptions()
    }, 350)

    return () => {
      if (shippingCalcTimeoutRef.current) clearTimeout(shippingCalcTimeoutRef.current)
    }
  }, [
    showManualOrderModal,
    manualOrderSummary.subtotal,
    manualOrderForm.customerDetails.phone,
    manualOrderForm.shippingAddress.state,
    manualOrderForm.shippingAddress.city,
    manualOrderForm.shippingAddress.pincode,
    manualOrderForm.shippingAddress.country
  ])

  useEffect(() => {
    return () => {
      if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current)
      if (shippingCalcTimeoutRef.current) clearTimeout(shippingCalcTimeoutRef.current)
    }
  }, [])

  const createManualOrder = async () => {
    if (manualOrderSubmitting) return

    const customerName = manualOrderForm.customerDetails.name.trim()
    const customerPhone = manualOrderForm.customerDetails.phone.trim()
    const salesPersonName = manualOrderForm.salesPersonName.trim()
    let selectedShippingMethodId = manualOrderForm.shippingMethodId
    let selectedShippingMethodName = manualOrderForm.shippingMethodName
    let finalShippingCost = manualOrderSummary.shippingCost

    if (!customerName) { toast.error("Customer name is required"); return }
    if (!customerPhone) { toast.error("Customer phone is required"); return }
    if (!salesPersonName) { toast.error("Sales person name is required"); return }

    if (!manualOrderForm.shippingAddress.addressLine1.trim() ||
        !manualOrderForm.shippingAddress.city.trim() ||
        !manualOrderForm.shippingAddress.state.trim() ||
        !manualOrderForm.shippingAddress.pincode.trim()) {
      toast.error("Shipping address line 1, city, state and pincode are required")
      return
    }

    const availableShippingOptions = shippingOptions.length > 0
      ? shippingOptions
      : buildShippingFallbackOptions(shippingMethods)

    if (!selectedShippingMethodId && availableShippingOptions.length > 0) {
      const firstOption = availableShippingOptions[0]
      selectedShippingMethodId = String(firstOption.methodId || "")
      selectedShippingMethodName = String(firstOption.methodName || "")
    }

    if (selectedShippingMethodId) {
      const selected =
        availableShippingOptions.find((option) => String(option.methodId) === String(selectedShippingMethodId)) ||
        shippingMethods.find((method) => String(method._id) === String(selectedShippingMethodId))

      if (selected) {
        const suggestedCost = Number(
          selected.shippingCost !== undefined && selected.shippingCost !== null
            ? selected.shippingCost
            : (selected.fixedShippingRate ?? 0)
        )
        const enteredCost = Number(manualOrderForm.shippingCost || 0)
        if (!Number.isFinite(enteredCost) || enteredCost <= 0) {
          finalShippingCost = Number.isFinite(suggestedCost) ? Math.max(suggestedCost, 0) : finalShippingCost
        }
      }
    }

    const sanitizedItems = manualOrderForm.items.map((item) => ({
      name: item.name.trim(),
      sku: item.sku?.trim() || "",
      retailerId: item.retailerId?.trim() || item.sku?.trim() || "",
      inventoryItemId: item.inventoryItemId || "",
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Math.max(0, Number(item.price) || 0)
    }))

    if (sanitizedItems.some((item) => !item.name || item.price < 0 || item.quantity <= 0)) {
      toast.error("Every product must have valid name, quantity and price")
      return
    }

    try {
      setManualOrderSubmitting(true)
      const headers = getAuthHeaders()
      if (!headers) throw new Error("Authentication token not found.")

      const { data: result } = await requestWithApiFallback("/api/orders/manual", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerDetails: {
            ...manualOrderForm.customerDetails,
            name: customerName,
            phone: customerPhone
          },
          shippingAddress: {
            ...manualOrderForm.shippingAddress,
            name: manualOrderForm.shippingAddress.name || customerName,
            phone: manualOrderForm.shippingAddress.phone || customerPhone
          },
          salesPersonName,
          paymentMethod: manualOrderForm.paymentMethod,
          paymentStatus: manualOrderForm.paymentStatus,
          shippingMethodId: selectedShippingMethodId || "",
          shippingMethodName: selectedShippingMethodName || "",
          shippingCost: finalShippingCost,
          taxAmount: manualOrderSummary.taxAmount,
          discountAmount: manualOrderSummary.discountAmount,
          notes: manualOrderForm.notes,
          items: sanitizedItems
        })
      })

      if (!result?.success) throw new Error(result.error || "Failed to create manual order")

      toast.success(`Manual order #${result.order?.orderId || "created"} added`)
      closeManualOrderModal()
      fetchOrders()
    } catch (error) {
      console.error("Manual order create error:", error)
      toast.error(error.message || "Failed to create manual order")
    } finally {
      setManualOrderSubmitting(false)
    }
  }

  const getFilteredOrders = useCallback(() => {
    let filtered = orders

    if (orderFilterType !== "all") {
      filtered = filtered.filter((order) => order.orderCategory === orderFilterType)
    }

    if (dateFilter.enabled && dateFilter.startDate && dateFilter.endDate) {
      filtered = filtered.filter((order) => {
        if (!order.orderDate) return false
        const orderDate = new Date(order.orderDate)
        const start = new Date(dateFilter.startDate)
        const end = new Date(dateFilter.endDate)
        end.setHours(23, 59, 59, 999)
        return orderDate >= start && orderDate <= end
      })
    }

    if (filterStatus === "Completed") {
      filtered = filtered.filter((order) => getOrderCategory(order.status) === 'completed');
    } else if (filterStatus !== "All Orders") {
      filtered = filtered.filter((order) => order.status?.toLowerCase() === filterStatus.toLowerCase());
    }

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (order) =>
          order.customerDetails?.name?.toLowerCase().includes(searchLower) ||
          order.customerPhone?.includes(searchTerm) ||
          order.orderId?.toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [orders, orderFilterType, dateFilter, filterStatus, searchTerm])

  const filteredOrders = getFilteredOrders()

  const paginationData = useMemo(() => {
    const totalItems = filteredOrders.length
    const totalPages = Math.ceil(totalItems / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

    return {
      totalItems,
      totalPages,
      startIndex,
      endIndex: Math.min(endIndex, totalItems),
      paginatedOrders,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    }
  }, [filteredOrders, currentPage, itemsPerPage])

  const goToPage = (page) => {
    const newPage = Math.max(1, Math.min(page, paginationData.totalPages))
    setCurrentPage(newPage)
  }

  const goToFirstPage = () => goToPage(1)
  const goToLastPage = () => goToPage(paginationData.totalPages)
  const goToNextPage = () => goToPage(currentPage + 1)
  const goToPrevPage = () => goToPage(currentPage - 1)

  const getPageNumbers = () => {
    const { totalPages } = paginationData
    const pages = []
    const maxVisiblePages = isMobile ? 3 : 5

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      const half = Math.floor(maxVisiblePages / 2)
      let start = Math.max(1, currentPage - half)
      let end = Math.min(totalPages, start + maxVisiblePages - 1)

      if (end - start + 1 < maxVisiblePages) start = Math.max(1, end - maxVisiblePages + 1)

      if (start > 1) { pages.push(1); if (start > 2) pages.push('...') }
      for (let i = start; i <= end; i++) { if (i !== 1 && i !== totalPages) pages.push(i) }
      if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages) }
    }

    return pages
  }

  const handlePaymentStatusChange = (orderId, newStatus) => {
    const normalizedStatus = normalizePaymentStatus(newStatus)
    if (normalizedStatus === 'completed') {
      setPendingPaymentData({ orderId, status: normalizedStatus });
      setShowPaymentConfirm(true);
    } else {
      executePaymentStatusUpdate(orderId, normalizedStatus);
    }
  };

  const handleOrderStatusChange = async (orderId, newStatus) => {
    const oldOrders = [...orders];
    setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, status: newStatus } : o));
    if (selectedOrder?.orderId === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : prev))
    }

    try {
      const headers = getAuthHeaders();
      if (!headers) throw new Error("Authentication token not found.");
      await requestWithApiFallback(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      console.error("Failed to update status:", error);
      setOrders(oldOrders);
      if (selectedOrder?.orderId === orderId) {
        const restored = oldOrders.find((order) => order.orderId === orderId)
        if (restored) setSelectedOrder(restored)
      }
      toast.error("Failed to update status");
    }
  };

  const executePaymentStatusUpdate = async (orderId = pendingPaymentData.orderId, newStatus = pendingPaymentData.status) => {
    setShowPaymentConfirm(false);

    const previousOrders = [...orders];
    const previousSelectedOrder = selectedOrder ? { ...selectedOrder } : null
    const normalizedStatus = normalizePaymentStatus(newStatus)
    const completedAt = normalizedStatus === "completed" ? new Date().toISOString() : null

    setOrders(prevOrders =>
      prevOrders.map(o =>
        o.orderId === orderId ? { ...o, paymentStatus: normalizedStatus, paidAt: completedAt || o.paidAt } : o
      )
    );
    if (selectedOrder?.orderId === orderId) {
      setSelectedOrder((prev) => prev
        ? { ...prev, paymentStatus: normalizedStatus, paidAt: completedAt || prev.paidAt }
        : prev
      )
    }

    try {
      const headers = getAuthHeaders();
      if (!headers) throw new Error("Authentication token not found.");
      const { data: result } = await requestWithApiFallback(`/api/orders/${orderId}/payment-status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ paymentStatus: normalizedStatus }),
      });

      if (result?.success) {
        if (normalizedStatus === 'completed') fetchOrders();
        toast.success("Payment status updated successfully");
      } else {
        throw new Error(result?.error || "Update failed");
      }
    } catch (error) {
      console.error("Payment update error:", error);
      setOrders(previousOrders);
      if (previousSelectedOrder?.orderId === orderId) setSelectedOrder(previousSelectedOrder)
      toast.error("Failed to update payment status");
    }
  };

  const handleEditOrder = (order) => {
    setSelectedOrder(order)
    setAddressForm(order.shippingAddress || {})
    setShowOrderModal(true)
  }

  const closeModal = () => {
    setShowOrderModal(false)
    setSelectedOrder(null)
    setEditingAddress(false)
    setAddressForm({})
  }

  const handleEditAddress = () => setEditingAddress(true)
  const handleSaveAddress = () => setShowSaveConfirm(true);

  const executeAddressUpdate = async () => {
    setShowSaveConfirm(false);
    try {
      const headers = getAuthHeaders();
      if (!headers) throw new Error("Authentication token not found.");
      await requestWithApiFallback(`/api/orders/${selectedOrder.orderId}/address`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ shippingAddress: addressForm }),
      });

      const updatedOrder = { ...selectedOrder, shippingAddress: addressForm };
      setSelectedOrder(updatedOrder);
      setOrders(prevOrders =>
        prevOrders.map(o => o.orderId === selectedOrder.orderId ? updatedOrder : o)
      );
      setEditingAddress(false);
      toast.success("Address updated successfully!");
    } catch (error) {
      console.error("Error saving address:", error);
      toast.error(`Failed to save: ${error.message}`);
    }
  };

  const handleCancelAddressEdit = () => {
    setAddressForm(selectedOrder?.shippingAddress || {})
    setEditingAddress(false)
  }

  const sendPaymentConfirmationMessage = async () => {
    if (!selectedOrder) return

    const recipientPhoneRaw = String(selectedOrder.customerPhone || "").trim()
    const recipientPhone = recipientPhoneRaw.replace(/\D/g, "") || recipientPhoneRaw
    if (!recipientPhone) { toast.error("Customer phone number is missing"); return }

    const headers = getAuthHeaders()
    if (!headers) { toast.error("Authentication token not found"); return }

    try {
      setSendingPaymentConfirmation(true)
      const customerName = String(selectedOrder.customerDetails?.name || "Customer").trim()
      const hardcodedMessage = `Hi ${customerName}, payment received successfully for your order #${selectedOrder.orderId}. Amount paid: ₹${Number(selectedOrder.totalAmount || 0).toFixed(2)}. Thank you for choosing GoWhats.`

      const { data } = await requestWithApiFallback("/api/messages/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: recipientPhone,
          text: hardcodedMessage,
          bypassWindowCheck: true
        })
      })

      if (!data?.success) throw new Error(data?.error || data?.message || "Failed to send payment confirmation message")
      toast.success("Payment confirmation message sent")
    } catch (error) {
      console.error("Payment confirmation message error:", error)
      toast.error(error.message || "Failed to send payment confirmation message")
    } finally {
      setSendingPaymentConfirmation(false)
    }
  }

  const getStatusStyle = (status) => {
    const s = status?.toLowerCase() || 'pending';
    const styles = {
      pending: "border-yellow-300 text-yellow-700 bg-yellow-50",
      completed: "border-green-300 text-green-700 bg-green-50",
      printed: "border-purple-300 text-purple-700 bg-purple-50",
      packed: "border-pink-300 text-pink-700 bg-pink-50",
      shipped: "border-orange-300 text-orange-700 bg-orange-50",
      tracked: "border-cyan-300 text-cyan-700 bg-cyan-50",
      cancelled: "border-red-300 text-red-700 bg-red-50",
      refunded: "border-red-300 text-red-700 bg-red-50",
      on_hold: "border-gray-300 text-gray-700 bg-gray-50",
    };
    return styles[s] || styles.pending;
  };

  const getPaymentStyle = (status) => {
    const s = normalizePaymentStatus(status);
    const styles = {
      pending: "bg-slate-100 text-slate-600 border-transparent",
      completed: "bg-emerald-100 text-emerald-800 border-transparent",
      failed: "bg-red-100 text-red-800 border-transparent",
      refunded: "bg-red-50 text-red-700 border-transparent",
      tested: "bg-blue-900 text-white border-transparent"
    };
    return styles[s] || styles.pending;
  };

  const getPaymentLabel = (status) => {
    const s = normalizePaymentStatus(status)
    if (s === "completed") return "COMPLETED"
    if (s === "pending") return "PENDING"
    return s.toUpperCase()
  }

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    } catch { return "Invalid Date" }
  }

  const formatCurrency = (amount) => `₹${Number(amount || 0).toFixed(2)}`
  const getOrderCountByCategory = (category) => orders.filter((o) => o.orderCategory === category).length

  const PaginationControls = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-white border-t border-gray-200">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>Show</span>
        <select
          value={itemsPerPage}
          onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1) }}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>per page</span>
      </div>

      <div className="text-sm text-gray-600">
        Showing <span className="font-semibold">{paginationData.startIndex + 1}</span> to{' '}
        <span className="font-semibold">{paginationData.endIndex}</span> of{' '}
        <span className="font-semibold">{paginationData.totalItems}</span> orders
      </div>

      <div className="flex items-center gap-1">
        <button onClick={goToFirstPage} disabled={!paginationData.hasPrevPage} className="p-2 rounded-md transition-colors hover:bg-gray-100 disabled:text-gray-300 text-gray-600"><ChevronsLeft className="w-4 h-4" /></button>
        <button onClick={goToPrevPage} disabled={!paginationData.hasPrevPage} className="p-2 rounded-md transition-colors hover:bg-gray-100 disabled:text-gray-300 text-gray-600"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            <button key={index} onClick={() => typeof page === 'number' && goToPage(page)} disabled={page === '...'} className={`min-w-[36px] h-9 px-3 rounded-md text-sm font-medium transition-colors ${page === currentPage ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{page}</button>
          ))}
        </div>
        <button onClick={goToNextPage} disabled={!paginationData.hasNextPage} className="p-2 rounded-md transition-colors hover:bg-gray-100 disabled:text-gray-300 text-gray-600"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={goToLastPage} disabled={!paginationData.hasNextPage} className="p-2 rounded-md transition-colors hover:bg-gray-100 disabled:text-gray-300 text-gray-600"><ChevronsRight className="w-4 h-4" /></button>
      </div>
    </div>
  )

  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div></div>

  if (error) return (
    <div className="flex h-screen items-center justify-center flex-col">
      <div className="text-red-500 text-xl mb-4">Error Loading Orders</div>
      <button onClick={fetchOrders} className="bg-green-600 text-white px-4 py-2 rounded">Retry</button>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <ToastContainer position="top-right" theme="colored" autoClose={2000} />

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">API Configuration</h3>
            <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(normalizeApiBaseUrl(e.target.value))} className="w-full px-3 py-2 border rounded mb-4" />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const normalized = normalizeApiBaseUrl(apiBaseUrl) || getDefaultApiBaseUrl()
                  setApiBaseUrl(normalized)
                  localStorage.setItem("apiBaseUrl", normalized)
                  setShowConfig(false)
                  fetchOrders()
                }}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                Save
              </button>
              <button onClick={() => setShowConfig(false)} className="bg-gray-600 text-white px-4 py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Order Modal */}
      {showManualOrderModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">

            {/* Header */}
            <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-green-100 flex items-center justify-center">
                    <ShoppingCart className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Create Manual Order</h3>
                    <p className="text-gray-500 text-sm mt-0.5">Add order details and track payment status</p>
                  </div>
                </div>
                <button
                  onClick={closeManualOrderModal}
                  className="w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all"
                  disabled={manualOrderSubmitting}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">

                {/* Customer & Order Info */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Customer Details Card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <User className="w-4 h-4 text-emerald-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900">Customer Details</h4>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualOrderForm.customerDetails.name}
                          onChange={(e) => handleManualFieldChange("customerDetails", "name", e.target.value)}
                          className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          placeholder="Enter customer name"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Phone <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualOrderForm.customerDetails.phone}
                          onChange={(e) => handleManualFieldChange("customerDetails", "phone", e.target.value)}
                          className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          placeholder="+91 9876543210"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Order Settings Card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Settings className="w-4 h-4 text-emerald-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900">Order Settings</h4>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Sales Person <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualOrderForm.salesPersonName}
                          onChange={(e) => handleManualTopLevelChange("salesPersonName", e.target.value)}
                          className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          placeholder="Who created this order?"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Status</label>
                          <div className="relative">
                            <select
                              value={manualOrderForm.paymentStatus}
                              onChange={(e) => handleManualTopLevelChange("paymentStatus", e.target.value)}
                              className="w-full h-11 border border-gray-200 rounded-lg pl-4 pr-8 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                            >
                              <option value="pending">Pending</option>
                              <option value="completed">Completed</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Method</label>
                          <div className="relative">
                            <select
                              value={manualOrderForm.paymentMethod}
                              onChange={(e) => handleManualTopLevelChange("paymentMethod", e.target.value)}
                              className="w-full h-11 border border-gray-200 rounded-lg pl-4 pr-8 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                            >
                              <option value="online">Online</option>
                              <option value="cod">COD</option>
                              <option value="whatsapp_pay">WhatsApp Pay</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Address Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h4 className="font-semibold text-gray-900">Shipping Address</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Receiver Name</label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.name}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "name", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Same as customer"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Receiver Phone</label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.phone}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "phone", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Same as customer"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Address Line 1 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.addressLine1}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "addressLine1", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="House/Flat No., Building, Street"
                      />
                    </div>
                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Address Line 2</label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.addressLine2}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "addressLine2", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="Landmark, Area (Optional)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">City <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.city}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "city", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">State <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.state}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "state", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="State"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Pincode <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.pincode}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "pincode", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="6 digit pincode"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
                      <input
                        type="text"
                        value={manualOrderForm.shippingAddress.country}
                        onChange={(e) => handleManualFieldChange("shippingAddress", "country", e.target.value)}
                        className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        placeholder="India"
                      />
                    </div>
                  </div>
                </div>

                {/* Products Section */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Package className="w-4 h-4 text-emerald-600" />
                      </div>
                      <h4 className="font-semibold text-gray-900">Products</h4>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {manualOrderForm.items.length}
                      </span>
                    </div>
                    <button
                      onClick={addManualItem}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>

                  <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 bg-gray-50 rounded-lg mb-3">
                    <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</div>
                    <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</div>
                    <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Quantity</div>
                    <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Price</div>
                    <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Total</div>
                    <div className="col-span-1"></div>
                  </div>

                  <div className="space-y-3">
                    {manualOrderForm.items.map((item, index) => (
                      <div
                        key={`manual-item-${index}`}
                        className="group relative bg-gray-50/50 hover:bg-gray-50 border border-gray-100 rounded-xl p-4 transition-all"
                      >
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-12 lg:col-span-4 relative">
                            <label className="lg:hidden block text-xs font-medium text-gray-500 mb-1.5">Product Name *</label>
                            <div className="relative">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleManualItemAutocomplete(index, "name", e.target.value)}
                                onFocus={() => {
                                  setManualSuggestionContext({ index, field: "name" })
                                  if (String(item.name || "").trim().length >= 2) fetchProductSuggestions(index, item.name)
                                }}
                                onBlur={() => {
                                  setTimeout(() => {
                                    setManualSuggestionContext((prev) =>
                                      prev.index === index && prev.field === "name" ? { index: null, field: null } : prev
                                    )
                                  }, 150)
                                }}
                                className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                placeholder="Search or enter product name"
                              />
                              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                            </div>

                            {manualSuggestionContext.index === index &&
                              manualSuggestionContext.field === "name" &&
                              (manualProductSuggestions[index] || []).length > 0 && (
                                <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                                  <div className="max-h-64 overflow-y-auto">
                                    {(manualProductSuggestions[index] || []).map((product) => (
                                      <button
                                        key={`product-suggest-name-${index}-${product._id}`}
                                        type="button"
                                        className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-gray-100 last:border-b-0 transition-colors"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => applySuggestedProduct(index, product)}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{product.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">SKU: {getProductSku(product) || "N/A"}</p>
                                          </div>
                                          <span className="text-sm font-semibold text-emerald-600">₹{safeNumber(product.price).toFixed(2)}</span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>

                          <div className="col-span-6 lg:col-span-2 relative">
                            <label className="lg:hidden block text-xs font-medium text-gray-500 mb-1.5">SKU</label>
                            <input
                              type="text"
                              value={item.sku}
                              onChange={(e) => handleManualItemAutocomplete(index, "sku", e.target.value)}
                              onFocus={() => {
                                setManualSuggestionContext({ index, field: "sku" })
                                if (String(item.sku || "").trim().length >= 2) fetchProductSuggestions(index, item.sku)
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setManualSuggestionContext((prev) =>
                                    prev.index === index && prev.field === "sku" ? { index: null, field: null } : prev
                                  )
                                }, 150)
                              }}
                              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                              placeholder="SKU"
                            />

                            {manualSuggestionContext.index === index &&
                              manualSuggestionContext.field === "sku" &&
                              (manualProductSuggestions[index] || []).length > 0 && (
                                <div className="absolute z-50 mt-1 w-64 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                                  <div className="max-h-64 overflow-y-auto">
                                    {(manualProductSuggestions[index] || []).map((product) => (
                                      <button
                                        key={`product-suggest-sku-${index}-${product._id}`}
                                        type="button"
                                        className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-gray-100 last:border-b-0 transition-colors"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => applySuggestedProduct(index, product)}
                                      >
                                        <p className="text-sm font-mono font-medium text-gray-900">{getProductSku(product) || "N/A"}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{product.name}</p>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>

                          <div className="col-span-3 lg:col-span-2">
                            <label className="lg:hidden block text-xs font-medium text-gray-500 mb-1.5">Qty *</label>
                            <div className="flex items-center justify-center">
                              <button
                                onClick={() => handleManualItemChange(index, "quantity", Math.max(1, Number(item.quantity) - 1))}
                                className="w-9 h-11 flex items-center justify-center border border-r-0 border-gray-200 rounded-l-lg bg-white hover:bg-gray-50 text-gray-600"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleManualItemChange(index, "quantity", e.target.value)}
                                className="w-14 h-11 border-y border-gray-200 text-center text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500/20"
                              />
                              <button
                                onClick={() => handleManualItemChange(index, "quantity", Number(item.quantity) + 1)}
                                className="w-9 h-11 flex items-center justify-center border border-l-0 border-gray-200 rounded-r-lg bg-white hover:bg-gray-50 text-gray-600"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="col-span-3 lg:col-span-2">
                            <label className="lg:hidden block text-xs font-medium text-gray-500 mb-1.5">Price *</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => handleManualItemChange(index, "price", e.target.value)}
                                className="w-full h-11 border border-gray-200 rounded-lg pl-7 pr-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-right"
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          <div className="col-span-4 lg:col-span-1 flex items-center justify-end">
                            <div className="text-right">
                              <span className="lg:hidden text-xs text-gray-500 mr-2">Total:</span>
                              <span className="text-sm font-bold text-gray-900">
                                ₹{(Math.max(1, safeNumber(item.quantity)) * Math.max(0, safeNumber(item.price))).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="col-span-2 lg:col-span-1 flex justify-end">
                            <button
                              onClick={() => removeManualItem(index)}
                              className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              disabled={manualOrderForm.items.length <= 1}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shipping, Tax, Discount & Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">

                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <Truck className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900">Shipping & Pricing</h4>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipping Method</label>
                          <div className="relative">
                            <select
                              value={manualOrderForm.shippingMethodId}
                              onChange={(e) => handleShippingMethodSelect(e.target.value)}
                              className="w-full h-11 border border-gray-200 rounded-lg pl-4 pr-8 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                            >
                              <option value="">Select shipping method</option>
                              {shippingOptions.map((option) => (
                                <option key={`manual-shipping-${option.methodId}`} value={option.methodId}>
                                  {option.methodName} ({option.courierType || "courier"}) - ₹{safeNumber(option.shippingCost).toFixed(2)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>
                          {shippingLoading && (
                            <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading options...
                            </p>
                          )}
                          {!shippingLoading && shippingError && (
                            <p className="text-xs text-red-500 mt-1.5">{shippingError}</p>
                          )}
                          {!shippingLoading && !shippingError && shippingOptions.length === 0 && (
                            <p className="text-xs text-gray-500 mt-1.5">No shipping methods available</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipping Cost</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={manualOrderForm.shippingCost}
                              onChange={(e) => handleManualTopLevelChange("shippingCost", e.target.value)}
                              className="w-full h-11 border border-gray-200 rounded-lg pl-7 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tax Amount</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={manualOrderForm.taxAmount}
                              onChange={(e) => handleManualTopLevelChange("taxAmount", e.target.value)}
                              className="w-full h-11 border border-gray-200 rounded-lg pl-7 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Discount Amount</label>
                        <div className="relative max-w-xs">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={manualOrderForm.discountAmount}
                            onChange={(e) => handleManualTopLevelChange("discountAmount", e.target.value)}
                            className="w-full h-11 border border-gray-200 rounded-lg pl-7 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900">Order Notes</h4>
                        <span className="text-xs text-gray-400">(Internal use only)</span>
                      </div>
                      <textarea
                        value={manualOrderForm.notes}
                        onChange={(e) => handleManualTopLevelChange("notes", e.target.value)}
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                        placeholder="Add any special instructions or notes about this order..."
                      />
                    </div>
                  </div>

                  {/* Order Summary */}
                  <div className="lg:col-span-1">
                    <div className="bg-gradient-to-b from-emerald-50/50 to-white rounded-xl border border-emerald-100 p-5 sticky top-4">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Receipt className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900">Order Summary</h4>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">Subtotal</span>
                          <span className="font-medium text-gray-900">₹{manualOrderSummary.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">Shipping</span>
                          <span className="font-medium text-gray-900">₹{manualOrderSummary.shippingCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">Tax</span>
                          <span className="font-medium text-gray-900">₹{manualOrderSummary.taxAmount.toFixed(2)}</span>
                        </div>
                        {manualOrderSummary.discountAmount > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Discount</span>
                            <span className="font-medium text-emerald-600">- ₹{manualOrderSummary.discountAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="border-t border-emerald-100 pt-3 mt-3">
                          <div className="flex justify-between items-center">
                            <span className="text-base font-semibold text-gray-900">Total</span>
                            <span className="text-xl font-bold text-emerald-600">₹{manualOrderSummary.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 p-3 rounded-lg bg-white border border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Payment</span>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            manualOrderForm.paymentStatus === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {manualOrderForm.paymentStatus === 'completed' ? (
                              <><CheckCircle className="w-3 h-3" /> Completed</>
                            ) : (
                              <><Clock className="w-3 h-3" /> Pending</>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex-shrink-0 bg-gray-50 border-t border-gray-100 px-4 py-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={closeManualOrderModal}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
                    disabled={manualOrderSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createManualOrder}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                    disabled={manualOrderSubmitting}
                  >
                    {manualOrderSubmitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                    ) : (
                      <><Check className="w-4 h-4" /> Create Order</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Control Bar */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3">
          <div className="hidden md:flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="relative w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search orders..." className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <select
                className="bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option>All Orders</option>
                <option>Completed</option>
                <option>Pending</option>
                <option>Refunded</option>
                <option>Tested</option>
                <option>Printed</option>
                <option>Packed</option>
                <option>Tracked</option>
                <option>On Hold</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={openManualOrderModal} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                <Plus className="w-4 h-4" /> Manual Order
              </button>
              <button onClick={() => setShowDateFilterModal(true)} className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 ${dateFilter.enabled ? 'border-green-500 bg-green-50 text-green-700' : ''}`}>
                <Filter className="w-4 h-4"/> {dateFilter.enabled ? 'Filtered' : 'Filter'}
              </button>
              {dateFilter.enabled && (
                <button onClick={() => setDateFilter({ enabled: false, startDate: '', endDate: '' })} className="text-xs text-red-600 hover:text-red-800">Clear</button>
              )}
              <button onClick={() => setShowReportModal(true)} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"><Download className="w-4 h-4"/> Report</button>
              <button onClick={fetchOrders} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><RefreshCw className="w-4 h-4"/></button>
              <button onClick={() => setShowConfig(true)} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Settings className="w-4 h-4"/></button>
            </div>
          </div>

          {/* Mobile Controls */}
          <div className="flex flex-col gap-2 md:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search..." className="pl-10 w-full py-2 border rounded-lg text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={openManualOrderModal} className="flex-1 py-2 bg-green-600 text-white rounded text-xs flex justify-center items-center gap-1">
                <Plus className="w-3 h-3"/> Manual
              </button>
              <select className="flex-1 bg-white border px-2 py-2 rounded text-xs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option>All Orders</option>
                <option>Completed</option>
                <option>Pending</option>
                <option>Confirmed</option>
                <option>Processing</option>
                <option>Tracked</option>
              </select>
              <button onClick={() => setShowDateFilterModal(true)} className={`flex-1 py-2 border rounded text-xs flex justify-center items-center gap-1 ${dateFilter.enabled ? 'border-green-500 bg-green-50' : ''}`}>
                <Filter className="w-3 h-3"/> Filter
              </button>
              <button onClick={fetchOrders} className="flex-1 py-2 bg-green-600 text-white rounded text-xs flex justify-center items-center gap-1"><RefreshCw className="w-3 h-3"/> Refresh</button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">Total Orders</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{orders.length}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">Pending</div>
              <div className="text-2xl font-bold text-orange-600 mt-1">{getOrderCountByCategory("pending")}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">Completed</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{getOrderCountByCategory("completed")}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider">Revenue</div>
              <div className="text-2xl font-bold text-purple-600 mt-1">₹{orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toLocaleString()}</div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">S.No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Order</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Payment</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tracking</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginationData.paginatedOrders.map((order, index) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">{paginationData.startIndex + index + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-indigo-600">#{order.orderId}</div>
                        <div className="text-xs text-gray-400">{order.items?.length || 0} items</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{order.customerDetails?.name}</div>
                        <div className="text-xs text-gray-500">{order.customerPhone}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-700">{formatCurrency(order.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <select
                          value={normalizePaymentStatus(order.paymentStatus)}
                          onChange={(e) => handlePaymentStatusChange(order.orderId, e.target.value)}
                          className={`h-8 w-32 px-2 text-xs font-bold rounded-lg border-0 focus:ring-1 focus:ring-opacity-50 cursor-pointer outline-none transition-all shadow-sm text-center uppercase ${getPaymentStyle(order.paymentStatus)}`}
                        >
                          <option value="pending">PENDING</option>
                          <option value="completed">COMPLETED</option>
                          <option value="refunded">REFUNDED</option>
                          <option value="tested">TESTED</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status || 'pending'}
                          onChange={(e) => handleOrderStatusChange(order.orderId, e.target.value)}
                          className={`h-8 w-32 px-2 text-xs font-bold rounded-lg border focus:ring-1 focus:ring-opacity-50 cursor-pointer outline-none transition-all shadow-sm text-center uppercase ${getStatusStyle(order.status)}`}
                        >
                          <option value="pending">PENDING</option>
                          <option value="printed">PRINTED</option>
                          <option value="packed">PACKED</option>
                          <option value="tracked">TRACKED</option>
                          <option value="on_hold">ON HOLD</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {order.trackingNumber !== "N/A" ? (
                          <div className="flex flex-col">
                            <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-mono border border-gray-200 inline-block w-fit">
                              {order.trackingNumber}
                            </span>
                            {order.trackedAt && <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">Sent: {formatDate(order.trackedAt)}</span>}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {order.paidAt ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-emerald-600">💳 {formatDate(order.paidAt)}</span>
                            <span className="text-[10px] text-gray-400 mt-0.5">🛒 {formatDate(order.createdAt)}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-400">No payment</span>
                            <span className="text-[10px] text-gray-400 mt-0.5">🛒 {formatDate(order.createdAt)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEditOrder(order)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paginationData.totalItems > 0 && <PaginationControls />}
          </div>

          {paginationData.totalItems === 0 && (
            <div className="hidden md:flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
              <Package className="w-12 h-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No orders found</h3>
              <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filter criteria</p>
            </div>
          )}

          {/* Mobile List */}
          <div className="md:hidden space-y-3">
            {paginationData.paginatedOrders.map((order) => (
              <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-indigo-600">#{order.orderId}</div>
                    <div className="text-sm font-medium">{order.customerDetails?.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-800">{formatCurrency(order.totalAmount)}</div>
                    <div className="text-xs text-gray-500">{formatDate(order.createdAt)}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <span className={`px-2 py-1 text-xs rounded font-bold ${getPaymentStyle(order.paymentStatus)}`}>{getPaymentLabel(order.paymentStatus)}</span>
                  <span className={`px-2 py-1 text-xs rounded font-bold ${getStatusStyle(order.status)}`}>{order.status}</span>
                </div>
                <button onClick={() => handleEditOrder(order)} className="mt-3 w-full py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                  View Details
                </button>
              </div>
            ))}

            {paginationData.totalItems > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">Page {currentPage} of {paginationData.totalPages}</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1) }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={goToPrevPage} disabled={!paginationData.hasPrevPage} className={`flex-1 py-2 rounded-lg text-sm font-medium ${paginationData.hasPrevPage ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-50 text-gray-300'}`}>Previous</button>
                  <button onClick={goToNextPage} disabled={!paginationData.hasNextPage} className={`flex-1 py-2 rounded-lg text-sm font-medium ${paginationData.hasNextPage ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-50 text-gray-300'}`}>Next</button>
                </div>
              </div>
            )}

            {paginationData.totalItems === 0 && (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
                <Package className="w-12 h-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No orders found</h3>
                <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Date Filter Modal */}
      {showDateFilterModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm">
            <h3 className="font-bold text-lg mb-4">Filter by Date</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" className="w-full border p-2 rounded" value={tempStartDate} onChange={e => setTempStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" className="w-full border p-2 rounded" value={tempEndDate} onChange={e => setTempEndDate(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setDateFilter({enabled: true, startDate: tempStartDate, endDate: tempEndDate}); setShowDateFilterModal(false); }} className="flex-1 bg-green-600 text-white py-2 rounded font-medium">Apply</button>
              <button onClick={() => { setDateFilter({enabled: false, startDate: '', endDate: ''}); setShowDateFilterModal(false); }} className="flex-1 bg-red-100 text-red-700 py-2 rounded font-medium">Clear</button>
              <button onClick={() => setShowDateFilterModal(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && <OrderReportDownload orders={orders} isOpen={showReportModal} onClose={() => setShowReportModal(false)} />}

      {/* Order Details Modal */}
      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-green-600 p-6 rounded-t-xl">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Order Details - #{selectedOrder.orderId}</h2>
                <button onClick={closeModal} className="text-white/80 hover:text-white transition-colors duration-200 p-2 hover:bg-white/10 rounded-lg">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                <div className="bg-green-50 border border-green-200 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center text-green-800">
                    <User className="h-5 w-5 mr-2" /> Customer Information
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <span className="font-medium text-green-700 w-16">Name:</span>
                      <span className="text-gray-900 break-words">{selectedOrder.customerDetails?.name || "N/A"}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium text-green-700 w-16">Phone:</span>
                      <span className="text-gray-900">{selectedOrder.customerPhone || "N/A"}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium text-green-700 w-16">Email:</span>
                      <span className="text-gray-900 break-all">{selectedOrder.customerDetails?.email || "N/A"}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium text-green-700 w-16">Source:</span>
                      <span className="text-gray-900 capitalize">{selectedOrder.source || "N/A"}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium text-green-700 w-16">Sales:</span>
                      <span className="text-gray-900 break-words">{selectedOrder.salesPersonName || "N/A"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
                    <div className="flex items-center text-blue-800">
                      <MapPin className="h-5 w-5 mr-2" /> Shipping Address
                    </div>
                    <button onClick={handleEditAddress} className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-100 rounded">
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </h3>

                  {editingAddress ? (
                    <div className="space-y-3">
                      <input type="text" placeholder="Name" value={addressForm.name || ""} onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                      <input type="text" placeholder="Address Line 1" value={addressForm.addressLine1 || ""} onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="City" value={addressForm.city || ""} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
                        <input type="text" placeholder="State" value={addressForm.state || ""} onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
                      </div>
                      <input type="text" placeholder="Pincode" value={addressForm.pincode || ""} onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                      <div className="flex gap-2">
                        <button onClick={handleSaveAddress} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm">Save</button>
                        <button onClick={handleCancelAddressEdit} className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div className="text-gray-900">{selectedOrder.shippingAddress?.name || "N/A"}</div>
                      <div className="text-gray-700">{selectedOrder.shippingAddress?.addressLine1 || "N/A"}</div>
                      <div className="text-gray-700">{selectedOrder.shippingAddress?.city || "N/A"}, {selectedOrder.shippingAddress?.state} - {selectedOrder.shippingAddress?.pincode}</div>
                      <div className="text-gray-700">{selectedOrder.shippingAddress?.country || "India"}</div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 bg-purple-50 border border-purple-200 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center text-purple-800">
                    <Package className="h-5 w-5 mr-2" /> Order Items ({selectedOrder.items?.length || 0} items)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-purple-800">Item</th>
                          <th className="px-4 py-3 text-center text-purple-800">Qty</th>
                          <th className="px-4 py-3 text-right text-purple-800">Price</th>
                          <th className="px-4 py-3 text-right text-purple-800">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items?.map((item, index) => (
                          <tr key={index} className="border-b border-purple-200">
                            <td className="px-4 py-3 text-gray-900">{item.name}</td>
                            <td className="px-4 py-3 text-center">{item.quantity}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(item.price)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.totalPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center text-yellow-800">
                    <CreditCard className="h-5 w-5 mr-2" /> Payment Breakdown
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal (Items):</span>
                      <span className="text-gray-900 font-medium">{formatCurrency(selectedOrder.orderAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Shipping Cost:</span>
                      <span className="text-gray-900 font-medium">{selectedOrder.shippingCost > 0 ? formatCurrency(selectedOrder.shippingCost) : "FREE"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Shipping Method:</span>
                      <span className="text-gray-900 font-medium">{selectedOrder.shippingMethodName || "Not selected"}</span>
                    </div>
                    <div className="border-t border-yellow-200 my-2"></div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-800 text-base">Total Amount:</span>
                      <span className="font-bold text-green-700 text-lg">{formatCurrency(selectedOrder.totalAmount)}</span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-yellow-200 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase">Payment Status</span>
                        <select
                          value={normalizePaymentStatus(selectedOrder.paymentStatus)}
                          onChange={(e) => handlePaymentStatusChange(selectedOrder.orderId, e.target.value)}
                          className={`h-8 w-32 px-2 text-xs font-bold rounded-lg border-0 focus:ring-1 focus:ring-opacity-50 cursor-pointer outline-none transition-all shadow-sm text-center uppercase ${getPaymentStyle(selectedOrder.paymentStatus)}`}
                        >
                          <option value="pending">PENDING</option>
                          <option value="completed">COMPLETED</option>
                          <option value="refunded">REFUNDED</option>
                          <option value="tested">TESTED</option>
                        </select>
                      </div>

                      <div className="flex justify-between items-center text-xs text-gray-600">
                        <span>Sales Person</span>
                        <span className="font-semibold text-gray-800">{selectedOrder.salesPersonName || "Not assigned"}</span>
                      </div>

                      {normalizePaymentStatus(selectedOrder.paymentStatus) === "completed" && (
                        <div className="pt-2 border-t border-yellow-100">
                          <button
                            onClick={sendPaymentConfirmationMessage}
                            disabled={sendingPaymentConfirmation}
                            className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {sendingPaymentConfirmation ? "Sending..." : "Send Payment Confirmation"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 flex items-center text-gray-800">
                    <Truck className="h-5 w-5 mr-2" /> Status
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700 text-sm">Current Status:</span>
                      <span className={`px-3 py-1 text-xs rounded-full font-bold uppercase ${getStatusStyle(selectedOrder.status)}`}>
                        {selectedOrder.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700 text-sm">Order Date:</span>
                      <span className="text-gray-900 text-sm">{formatDate(selectedOrder.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={closeModal} className="px-6 py-3 text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors duration-200 font-medium">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      {showSaveConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4"><AlertTriangle className="h-6 w-6 text-blue-600" /></div>
              <h3 className="text-lg font-bold">Confirm Update</h3>
              <p className="text-sm text-gray-500 mt-2">Update shipping address?</p>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowSaveConfirm(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={executeAddressUpdate} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">Yes, Update</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4"><CheckCircle className="h-6 w-6 text-green-600" /></div>
              <h3 className="text-lg font-bold">Confirm Payment</h3>
              <p className="text-sm text-gray-500 mt-2">Mark as COMPLETED?</p>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowPaymentConfirm(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={() => executePaymentStatusUpdate()} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg">Yes, Complete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderSheet;
