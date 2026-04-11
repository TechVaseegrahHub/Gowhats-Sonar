import React, { useState, useEffect, useCallback } from "react"
import {
  Printer, Package, Truck, PauseCircle, MessageCircle, FileText,
  Settings, ChevronLeft, ChevronRight, Home, Calendar, MessageSquare,
  BarChart3, CreditCard, Bot, Tag, ArrowRight, Circle, ShoppingCart, MapPin,
  ClipboardList, Camera, Lock
} from "lucide-react"
import useSubscription from "../hooks/useSubscription"
import ProFeatureLockCard from "../components/ProFeatureLockCard"

// Import Components
import OrderSheet from "../components/OrderSheet"
import Inventory from "../pages/Inventory"
import PrintLabels from "../components/PrintLabels"
import Packing from "../components/Packing"
import Tracking from "../components/Tracking"
import Holding from "../components/Holding"
import RegistrationList from "../components/RegistrationList"
import TicketScanner from "../pages/TicketScanner"
import FlowQuestionsPage from "../pages/FlowQuestionsPage"

const FulfillmentFlow = () => {
  const { subscription, loading: subscriptionLoading } = useSubscription()
  const hasProAccess = subscription?.hasProAccess ?? subscription?.isPro ?? false
  const trialExpired = subscription?.trial?.isExpired
  const proExpired = subscription?.pro?.isExpired
  const mobileBreakpoint = 768
  const [isMobile, setIsMobile] = useState(false)
  const [activeSection, setActiveSection] = useState("order-sheet")
  const [isTransitioning, setIsTransitioning] = useState(false)

  const proOnlySections = new Set(["packing", "tracking", "holding"])
  const isSectionLocked = (sectionId) => !hasProAccess && proOnlySections.has(sectionId)

  const handleResize = useCallback(() => {
    if (typeof window !== "undefined") {
      const currentIsMobile = window.innerWidth < mobileBreakpoint
      setIsMobile(currentIsMobile)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentIsMobile = window.innerWidth < mobileBreakpoint
      setIsMobile(currentIsMobile)
      // ✅ FROM FILE 1: always default to "order-sheet" on both mobile and desktop
      setActiveSection("order-sheet")
    }
  }, [])

  useEffect(() => {
    window.addEventListener("resize", handleResize)
    return () => { window.removeEventListener("resize", handleResize) }
  }, [handleResize])

  const handleSectionChange = (sectionId) => {
    if (sectionId === activeSection) return
    setIsTransitioning(true)
    setTimeout(() => {
      setActiveSection(sectionId)
      setIsTransitioning(false)
    }, 120)
  }

  const allFulfillmentOptions = [
    {
      id: "order-sheet",
      icon: <FileText className="w-5 h-5" />,
      title: "Orders",
      subtitle: "Process & Organize",
      description: "Review, validate and prepare incoming orders for fulfillment",
      step: 1, status: "completed", progress: 100, timeEstimate: "5 min", priority: "high"
      // ✅ FROM FILE 1: desktopOnly removed — visible on mobile too
    },
    {
      id: "print-labels",
      icon: <Printer className="w-5 h-5" />,
      title: "Printing",
      subtitle: "Shipping Labels",
      description: "Generate shipping labels with tracking codes and prepare for dispatch",
      step: 3, status: "active", progress: 65, timeEstimate: "3 min", priority: "urgent"
    },
    {
      id: "packing",
      icon: <Package className="w-5 h-5" />,
      title: "Packing",
      subtitle: "Quality & Pack",
      description: "Verify items, perform quality checks and secure packaging",
      step: 4, status: "pending", progress: 0, timeEstimate: "8 min", priority: "medium"
    },
    {
      id: "tracking",
      icon: <Truck className="w-5 h-5" />,
      title: "Tracking",
      subtitle: "Monitor & Update",
      description: "Track package delivery status and notify customers",
      step: 5, status: "pending", progress: 0, timeEstimate: "2 min", priority: "low"
    },
    {
      id: "inventory",
      icon: <ShoppingCart className="w-5 h-5" />,
      title: "Inventory",
      subtitle: "New Product & stock",
      description: "Add new products, update stock levels and manage SKUs",
      step: 2, status: "completed", progress: 100, timeEstimate: "5 min", priority: "high", desktopOnly: true
    },
    {
      id: "registrations",
      icon: <ClipboardList className="w-5 h-5" />,
      title: "Registrations",
      subtitle: "Event & Bookings",
      description: "View details of customers who registered via QR/Flow",
      step: 1.5, status: "completed", progress: 100, timeEstimate: "-", priority: "medium", desktopOnly: false
    },
    {
      id: "scanner",
      icon: <Camera className="w-5 h-5" />,
      title: "Scanner",
      subtitle: "Ticket Entry",
      description: "Scan QR codes for event ticket validation and entry",
      step: 1.6, status: "active", progress: 100, timeEstimate: "-", priority: "high", desktopOnly: false
    },
    {
      id: "flow-questions",
      icon: <MessageSquare className="w-5 h-5" />,
      title: "Questions",
      subtitle: "Speaker Q&A",
      description: "View questions submitted by attendees for each speaker",
      step: 1.7, status: "active", progress: 100, timeEstimate: "-", priority: "high", desktopOnly: false
    },
  ]

  const fulfillmentOptions = isMobile
    ? allFulfillmentOptions.filter(
        (option) => !option.desktopOnly && !["registrations", "scanner", "flow-questions"].includes(option.id)
      )
    : allFulfillmentOptions

  const renderContent = () => {
    if (isSectionLocked(activeSection)) {
      const labels = { packing: "Packing Module", tracking: "Tracking Module", holding: "Holding Module" }
      return (
        <div className="p-4 md:p-6 min-h-[calc(100vh-2rem)] flex items-center justify-center">
          <ProFeatureLockCard
            featureName={labels[activeSection] || "Feature"}
             description={proExpired
              ? "Your Pro subscription has expired. Please pay to continue using this module."
              : trialExpired
                ? "Your free trial has ended. Upgrade to Pro plan to unlock access."
                : "This module is locked in Free Trial. Upgrade to Pro plan to unlock access."
            }
          />
        </div>
      )
    }
    switch (activeSection) {
      case "order-sheet":    return <OrderSheet />
      case "print-labels":   return <PrintLabels />
      case "packing":        return <Packing />
      case "tracking":       return <Tracking />
      // case "holding":     return <Holding />
      case "inventory":      return <Inventory />
      case "registrations":  return <RegistrationList />
      case "scanner":        return <TicketScanner />
      case "flow-questions": return <FlowQuestionsPage />
      default: return <div className="p-4 text-center text-gray-500">Select a section</div>
    }
  }

  if (subscriptionLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-green-200 border-t-green-600" />
      </div>
    )
  }

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="h-screen flex flex-col bg-gray-900">
        {/* Mobile Tab Navigation — tabs only, no header above */}
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide bg-gray-900 flex-shrink-0">
          {fulfillmentOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSectionChange(option.id)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-colors duration-200 whitespace-nowrap flex items-center gap-1.5 ${
                activeSection === option.id
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {isSectionLocked(option.id) && <Lock className="w-3.5 h-3.5" />}
              {option.title}
            </button>
          ))}
        </div>

        {/* Content area — rounded-t-2xl, flush with tabs, no gap */}
        <main className="flex-1 bg-[#f0fdf4] rounded-t-2xl overflow-hidden">
          <div
            className={`h-full overflow-y-auto transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
          >
            <div className={activeSection === "registrations" ? "p-0" : "p-3"}>
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ── DESKTOP — unchanged ───────────────────────────────────────────────────
  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-green-500">Fulfillment Flow</h1>
        </div>
        <div className="flex-1 p-4 space-y-8 overflow-y-auto">
          {fulfillmentOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setActiveSection(option.id)}
              className={`w-full p-4 rounded-xl text-left transition-all duration-200 ${
                activeSection === option.id
                  ? 'bg-green-50 border-2 border-green-200'
                  : 'hover:bg-gray-100 border-2 border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  activeSection === option.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {option.icon}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{option.title}</h3>
                    {isSectionLocked(option.id) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        <Lock className="w-2.5 h-2.5" /> Pro
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{option.subtitle}</p>
                </div>
                {(activeSection === option.id) && (
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-gray-50">
        <div className="h-full overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

export default FulfillmentFlow
