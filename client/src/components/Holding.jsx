"use client"

// components/Holding.jsx
import { useState, useEffect } from "react"

const Holding = () => {
  const [formData, setFormData] = useState({
    orderNumber: "",
    productName: "",
    timeframe: "",
  })

  const [loading, setLoading] = useState(false)
  const [checkingOrder, setCheckingOrder] = useState(false)
  const [orderDetails, setOrderDetails] = useState(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [statusType, setStatusType] = useState("")
  const [isMobile, setIsMobile] = useState(false)

  // Check if mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const timeframeOptions = [
    { value: "", label: "Select timeframe" },
    { value: "Within a couple of days", label: "Within a couple of days" },
    { value: "Within three days", label: "Within three days" },
    { value: "Within a week", label: "Within a week" },
  ]

  const loadOrderDetails = async () => {
    if (!formData.orderNumber || formData.orderNumber.trim() === "") {
      setStatusMessage("Please enter Order Number first")
      setStatusType("error")
      return
    }

    try {
      setCheckingOrder(true)
      setOrderDetails(null)
      setStatusMessage("")

      const token = localStorage.getItem("token")
      if (!token) {
        setStatusMessage("Please login to check order details")
        setStatusType("error")
        return
      }

      const response = await fetch(
        `/api/holding/check-eligibility/${encodeURIComponent(formData.orderNumber.trim())}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      )

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text()
        setStatusMessage("Server configuration error. Check if backend is running.")
        setStatusType("error")
        return
      }

      const result = await response.json()

      if (response.ok) {
        setOrderDetails(result)

        if (result.details?.holdingInfo?.productName && !formData.productName) {
          setFormData((prev) => ({
            ...prev,
            productName: result.details.holdingInfo.productName,
            timeframe: result.details.holdingInfo.timeframe || "",
          }))
        }

        if (result.details) {
          setFormData((prev) => ({
            ...prev,
            customerName: result.details.customerName || "",
            customerPhone: result.details.customerPhone || "",
          }))
        }

        setStatusMessage("")
        setStatusType("")
      } else if (response.status === 404) {
        setOrderDetails(null)
        setStatusMessage(`Order ${formData.orderNumber} not found`)
        setStatusType("error")
      } else {
        setOrderDetails(null)
        setStatusMessage(result.error || `Failed to load order ${formData.orderNumber}`)
        setStatusType("error")
      }
    } catch (error) {
      console.error("Error loading order details:", error)
      setOrderDetails(null)

      if (error.name === "SyntaxError" && error.message.includes("Unexpected token")) {
        setStatusMessage("Server configuration error. The API is returning HTML instead of JSON.")
        setStatusType("error")
      } else if (error.name === "TypeError" && error.message.includes("fetch")) {
        setStatusMessage("Network error. Please check your internet connection.")
        setStatusType("error")
      } else {
        setStatusMessage("Failed to load order details. Please try again.")
        setStatusType("error")
      }
    } finally {
      setCheckingOrder(false)
    }
  }

  const handleOrderNumberKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      loadOrderDetails()
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    if (name === "orderNumber") {
      setOrderDetails(null)
      setStatusMessage("")
      setStatusType("")
    }
  }

  const handleTimeframeChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      timeframe: e.target.value,
    }))
  }

  const getTimeframeLabel = (value) => {
    const option = timeframeOptions.find((opt) => opt.value === value)
    return option ? option.label.toLowerCase() : "soon"
  }

  const sendHoldingNotification = async () => {
    if (!formData.orderNumber || !formData.productName || !formData.timeframe) {
      setStatusMessage("Please fill in all required fields including timeframe")
      setStatusType("error")
      return
    }

    if (!orderDetails?.eligible) {
      setStatusMessage("Order is not eligible for holding notification. Please check the requirements above.")
      setStatusType("error")
      return
    }

    try {
      setLoading(true)
      setStatusMessage("")

      const holdingData = {
        orderNumber: formData.orderNumber.trim(),
        productName: formData.productName.trim(),
        timeframe: formData.timeframe,
        customerName: orderDetails.details?.customerName || "Customer",
        customerPhone: orderDetails.details?.customerPhone,
      }

      const response = await fetch("/api/holding/send-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(holdingData),
      })

      const result = await response.json()

      if (response.ok) {
        const isUpdate = result.data?.isUpdate
        setStatusMessage(
          isUpdate ? "Holding notification updated successfully!" : "Holding notification sent successfully!",
        )
        setStatusType("success")

        setOrderDetails((prev) => ({
          ...prev,
          alreadyOnHold: true,
          details: {
            ...prev.details,
            orderStatus: "on_hold",
            holdingInfo: {
              productName: formData.productName,
              timeframe: formData.timeframe,
              notificationSent: true,
              notificationSentAt: new Date().toISOString(),
            },
            holdingCount: (prev.details.holdingCount || 0) + 1,
          },
        }))

        setFormData({
          orderNumber: "",
          productName: "",
          timeframe: "",
        })
        setOrderDetails(null)
      } else {
        setStatusMessage(result.error || "Failed to send holding notification")
        setStatusType("error")
      }
    } catch (error) {
      console.error("Error sending holding notification:", error)
      setStatusMessage("Failed to send holding notification")
      setStatusType("error")
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      orderNumber: "",
      productName: "",
      timeframe: "",
    })
    setOrderDetails(null)
    setStatusMessage("Form reset")
    setStatusType("info")
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "on_hold":
        return "text-emerald-600 bg-emerald-100"
      case "confirmed":
        return "text-emerald-600 bg-emerald-100"
      case "shipped":
        return "text-blue-600 bg-blue-100"
      case "tracked":
        return "text-purple-600 bg-purple-100"
      case "pending":
        return "text-yellow-600 bg-yellow-100"
      case "cancelled":
        return "text-red-600 bg-red-100"
      case "completed":
        return "text-emerald-600 bg-emerald-100"
      case "failed":
        return "text-red-600 bg-red-100"
      default:
        return "text-gray-600 bg-gray-100"
    }
  }

  const getStatusMessageColor = (type) => {
    switch (type) {
      case "success":
        return "text-emerald-600 bg-emerald-50 border-emerald-200"
      case "error":
        return "text-red-600 bg-red-50 border-red-200"
      case "warning":
        return "text-yellow-600 bg-yellow-50 border-yellow-200"
      case "info":
        return "text-blue-600 bg-blue-50 border-blue-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const isHoldUpdate = orderDetails?.alreadyOnHold

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-emerald-50 to-white overflow-auto">
      <div className="container mx-auto mt-14 md:mt-20 p-3 md:p-4 lg:p-6 max-w-4xl">
        <div className="bg-white rounded-xl md:rounded-lg shadow-lg border border-emerald-100">
          {/* Header - Mobile Optimized */}
          <div className="p-4 md:p-6 border-b border-emerald-200">
            <h2 className="text-xl md:text-2xl font-bold text-emerald-600 mb-2">Order Hold Management</h2>
            <p className="text-sm md:text-base text-gray-600">Manage order holds and send holding notifications to customers</p>
          </div>

          <div className="p-4 md:p-6 space-y-4 md:space-y-6">
            {/* Status Message Display - Mobile Optimized */}
            {statusMessage && (
              <div className={`p-3 rounded-lg border ${getStatusMessageColor(statusType)}`}>
                <p className="text-xs md:text-sm font-medium break-words">{statusMessage}</p>
              </div>
            )}

            {/* Payment Status Banner - Mobile Optimized */}
            {orderDetails && !orderDetails.eligible && orderDetails.requirements?.paymentMustBeCompleted && (
              <div className="bg-red-50 border border-red-200 p-3 md:p-4 rounded-lg">
                <p className="text-red-600 font-medium text-sm md:text-base">
                  Payment not completed for order {formData.orderNumber}
                </p>
              </div>
            )}

            {/* Order Number - Mobile Optimized */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Order Number *
                <span className="text-xs md:text-sm text-gray-500 block md:inline md:ml-1">
                  {isMobile ? "Tap Load to check" : "(Press Enter to load)"}
                </span>
              </label>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  name="orderNumber"
                  value={formData.orderNumber}
                  onChange={handleInputChange}
                  onKeyPress={handleOrderNumberKeyPress}
                  onFocus={(e) => e.target.style.borderColor = '#10b981'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  placeholder="Enter Order Number (e.g., 1001, 1002, etc.)"
                  className="flex-1 px-3 md:px-4 py-2.5 md:py-3 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:border-transparent outline-none transition duration-200 text-sm md:text-base"
                />
                <button
                  onClick={loadOrderDetails}
                  disabled={checkingOrder || !formData.orderNumber.trim()}
                  className="px-4 md:px-6 py-2.5 md:py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[120px] text-sm md:text-base transition duration-200"
                >
                  {checkingOrder ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Loading...
                    </>
                  ) : (
                    "Load Order"
                  )}
                </button>
              </div>

              {/* Enhanced Order Status Display - Mobile Optimized */}
              {orderDetails && (
                <div className="mt-3 p-3 md:p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm">
                    <div className="flex flex-col md:flex-row md:items-center">
                      <span className="font-medium">Payment Status:</span>
                      <span
                        className={`mt-1 md:mt-0 md:ml-2 px-2 py-1 rounded text-xs inline-block w-fit ${getStatusColor(orderDetails.details.paymentStatus)}`}
                      >
                        {orderDetails.details.paymentStatus}
                      </span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center">
                      <span className="font-medium">Order Status:</span>
                      <span
                        className={`mt-1 md:mt-0 md:ml-2 px-2 py-1 rounded text-xs inline-block w-fit ${getStatusColor(orderDetails.details.orderStatus)}`}
                      >
                        {orderDetails.details.orderStatus}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Customer:</span>
                      <span className="ml-2 break-words">{orderDetails.details.customerName || "N/A"}</span>
                    </div>
                    <div>
                      <span className="font-medium">Total Amount:</span>
                      <span className="ml-2">₹{orderDetails.details.totalAmount}</span>
                    </div>
                  </div>

                  {/* Show current holding information if order is on hold - Mobile Optimized */}
                  {orderDetails.alreadyOnHold && orderDetails.details.holdingInfo && (
                    <div className="mt-3 pt-3 border-t bg-emerald-50 rounded p-3">
                      <h4 className="font-medium text-emerald-700 mb-2 text-sm md:text-base">Current Hold Information:</h4>
                      <div className="text-xs md:text-sm text-emerald-600">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <p className="break-words">
                            <strong>Product:</strong> {orderDetails.details.holdingInfo.productName}
                          </p>
                          <p>
                            <strong>Timeframe:</strong> {orderDetails.details.holdingInfo.timeframe}
                          </p>
                          {orderDetails.details.onHoldAt && (
                            <p>
                              <strong>Hold Since:</strong> {new Date(orderDetails.details.onHoldAt).toLocaleDateString()}
                            </p>
                          )}
                          <p>
                            <strong>Notifications Sent:</strong> {orderDetails.details.holdingCount || 1}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Eligibility Status - Mobile Optimized */}
                  <div className="mt-3 pt-3 border-t border-emerald-200">
                    {orderDetails.eligible ? (
                      <div className="flex items-start md:items-center gap-2 text-emerald-600">
                        <svg className="w-4 h-4 md:w-5 md:h-5 mt-0.5 md:mt-0 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="font-medium text-xs md:text-sm">
                          {isHoldUpdate ? "Ready to update holding notification" : "Ready to send holding notification"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-start md:items-center gap-2 text-red-500">
                        <svg className="w-4 h-4 md:w-5 md:h-5 mt-0.5 md:mt-0 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="font-medium text-xs md:text-sm">Cannot send holding notification - Requirements not met</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Product Name - Mobile Optimized */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Holding Product *
                {isHoldUpdate && <span className="text-emerald-600 text-xs md:text-sm"> (Update)</span>}
              </label>
              <input
                type="text"
                name="productName"
                value={formData.productName}
                onChange={handleInputChange}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                placeholder={isHoldUpdate ? "Update product name" : "Enter product name"}
                className="w-full px-3 md:px-4 py-2.5 md:py-3 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:border-transparent outline-none transition duration-200 text-sm md:text-base"
              />
            </div>

            {/* Expected Dispatch Timeframe - Mobile Optimized */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Dispatch Timeframe *
                {isHoldUpdate && <span className="text-emerald-600 text-xs md:text-sm"> (Update)</span>}
              </label>
              <select
                name="timeframe"
                value={formData.timeframe}
                onChange={handleTimeframeChange}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                className="w-full px-3 md:px-4 py-2.5 md:py-3 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:border-transparent outline-none transition duration-200 text-sm md:text-base bg-white"
              >
                {timeframeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {formData.timeframe && (
                <p className="mt-1 text-xs md:text-sm text-gray-600">Selected: {getTimeframeLabel(formData.timeframe)}</p>
              )}
            </div>

            {/* Payment Status Warning - Mobile Optimized */}
            {orderDetails && !orderDetails.eligible && orderDetails.requirements?.paymentMustBeCompleted && (
              <div className="bg-red-50 border border-red-200 p-3 md:p-4 rounded-lg">
                <div className="flex items-start gap-2 text-red-600 mb-2">
                  <svg className="w-4 h-4 md:w-5 md:h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium text-sm md:text-base">Cannot Send Holding Notification</span>
                </div>
                <p className="text-red-700 text-xs md:text-sm">Payment must be completed before sending holding notification.</p>
                <div className="mt-2 text-xs md:text-sm text-red-600">
                  <p>
                    <strong>Current Payment Status:</strong> {orderDetails.details.paymentStatus}
                  </p>
                  <p>
                    <strong>Current Order Status:</strong> {orderDetails.details.orderStatus}
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons - Mobile Optimized */}
            <div className="flex flex-col md:flex-row gap-3 md:gap-4 pt-4">
              <button
                onClick={sendHoldingNotification}
                disabled={
                  loading ||
                  !orderDetails?.eligible ||
                  !formData.orderNumber ||
                  !formData.productName ||
                  !formData.timeframe
                }
                className="flex-1 px-4 md:px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm md:text-base transition duration-200"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {isHoldUpdate ? "Updating..." : "Sending..."}
                  </>
                ) : (
                  <>{isHoldUpdate ? "Update Holding Notification" : "Send Holding Notification"}</>
                )}
              </button>

              <button
                onClick={resetForm}
                className="px-4 md:px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm md:text-base md:w-auto transition duration-200"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Holding
