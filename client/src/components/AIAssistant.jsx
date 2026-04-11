"use client"

// components/AIAssistant.jsx - Enhanced UI with proper authentication and speech toggle
import { useState, useRef, useEffect } from "react"
import {
  Mic,
  MicOff,
  Send,
  X,
  Bot,
  Volume2,
  VolumeX,
  RefreshCw,
  Loader,
  AlertCircle,
  CheckCircle,
  Database,
  Shield,
  Activity,
} from "lucide-react"
import bot from "../images/robot1.png";

const AIAssistant = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: "ai",
      content:
        "Hi! I'm your GoWhats AI Assistant. How can I help you?",
      timestamp: new Date(),
      isRealtime: false,
    },
  ])

  const [inputText, setInputText] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [realtimeData, setRealtimeData] = useState(null)
  const [recognition, setRecognition] = useState(null)
  const [aiStatus, setAiStatus] = useState("ready")
  const [authStatus, setAuthStatus] = useState("checking")
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Initialize speech recognition
  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognitionInstance = new SpeechRecognition()

      recognitionInstance.continuous = false
      recognitionInstance.interimResults = false
      recognitionInstance.lang = "en-US"

      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setInputText(transcript)
        setIsListening(false)
      }

      recognitionInstance.onerror = () => setIsListening(false)
      recognitionInstance.onend = () => setIsListening(false)

      setRecognition(recognitionInstance)
    }
  }, [])

  // Check authentication status
  const checkAuthStatus = () => {
    const token = localStorage.getItem("token")
    const tenantId = localStorage.getItem("tenentid")
    const businessId = localStorage.getItem("businessId")
    const accessToken = localStorage.getItem("accessToken")
    const apiKey = localStorage.getItem("apiKey")

    if (!token || !tenantId) {
      setAuthStatus("missing")
      return false
    }

    setAuthStatus("authenticated")
    return { token, tenantId, businessId, accessToken, apiKey }
  }

  // Function to sanitize sensitive data from responses
  const sanitizeResponse = (text) => {
    if (!text) return text;

    // Remove tenant IDs, business IDs, API keys, tokens, and other sensitive patterns
    let sanitizedText = text
      .replace(/tenant\s+id\s*:?\s*["\']?[a-f0-9-]{36}["\']?/gi, 'Tenant ID: [PROTECTED]')
      .replace(/business\s+id\s*:?\s*["\']?[a-f0-9-]+["\']?/gi, 'Business ID: [PROTECTED]')
      .replace(/api\s+key\s*:?\s*["\']?[a-zA-Z0-9_-]+["\']?/gi, 'API Key: [PROTECTED]')
      .replace(/access\s+token\s*:?\s*["\']?[a-zA-Z0-9_-]+["\']?/gi, 'Access Token: [PROTECTED]')
      .replace(/token\s*:?\s*["\']?[a-zA-Z0-9_.-]+["\']?/gi, 'Token: [PROTECTED]')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[PROTECTED-ID]')
      .replace(/the tenant id is "[^"]+"/gi, 'Tenant ID is protected')
      .replace(/tenant id "[^"]+"/gi, 'Tenant ID: [PROTECTED]')
      .replace(/authentication\s*:?\s*tenant\s+id[^.]*\./gi, 'Authentication details are protected.')
      .replace(/no business id, access token, or api key configured/gi, 'Authentication configured')
      .replace(/authentication context[^.]*\./gi, 'Authentication verified.')

    return sanitizedText;
  }

  // Fetch comprehensive real-time data with proper authentication
  const fetchRealtimeData = async () => {
    setDataLoading(true)
    try {
      const authData = checkAuthStatus()
      if (!authData) {
        setAiStatus("error")
        return null
      }

      const headers = {
        Authorization: `Bearer ${authData.token}`,
        "x-tenant-id": authData.tenantId,
        "x-business-id": authData.businessId || "",
        "x-access-token": authData.accessToken || "",
        "x-api-key": authData.apiKey || "",
        "Content-Type": "application/json",
      }

      const response = await fetch("/api/realtime-ai/comprehensive/realtime-stats", {
        method: "GET",
        headers,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const responseData = await response.json()

      const data = {
        ...responseData,
        lastUpdated: new Date().toISOString(),
      }

      setRealtimeData(data)
      setLastUpdated(data.lastUpdated)
      setAiStatus("ready")
      return data
    } catch (error) {
      console.error("Error fetching comprehensive data:", error)
      setAiStatus("error")
      return null
    } finally {
      setDataLoading(false)
    }
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (isOpen) {
      checkAuthStatus()
      fetchRealtimeData()
      const interval = setInterval(fetchRealtimeData, 30000)
      return () => clearInterval(interval)
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const startListening = () => {
    if (recognition && !isListening) {
      setIsListening(true)
      recognition.start()
    }
  }

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop()
      setIsListening(false)
    }
  }

  // Enhanced speakText function with toggle control
  const speakText = (text) => {
    if ("speechSynthesis" in window && isSpeechEnabled) {
      // Sanitize text before speaking to avoid reading sensitive data
      const sanitizedText = sanitizeResponse(text)
      const utterance = new SpeechSynthesisUtterance(sanitizedText)
      utterance.rate = 0.9
      utterance.pitch = 1
      speechSynthesis.speak(utterance)
    }
  }

  // Function to stop current speech
  const stopSpeech = () => {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel()
    }
  }

  // Toggle speech function
  const toggleSpeech = () => {
    if (isSpeechEnabled) {
      stopSpeech()
    }
    setIsSpeechEnabled(!isSpeechEnabled)
  }

  // Process query with comprehensive AI
  const processQuery = async (userQuery) => {
    try {
      setAiStatus("processing")

      const authData = checkAuthStatus()
      if (!authData) {
        throw new Error("Authentication required")
      }

      const freshData = await fetchRealtimeData()
      const contextData = freshData || realtimeData || {}

      const requestPayload = {
        query: userQuery.trim(),
        context: contextData,
        timestamp: new Date().toISOString(),
      }

      const response = await fetch("/api/realtime-ai/process-comprehensive-query", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authData.token}`,
          "x-tenant-id": authData.tenantId,
          "x-business-id": authData.businessId || "",
          "x-access-token": authData.accessToken || "",
          "x-api-key": authData.apiKey || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const responseData = await response.json()

      if (responseData.fallback) {
        setAiStatus("fallback")
      } else {
        setAiStatus("ready")
      }

      return {
        response: sanitizeResponse(responseData.response), // Sanitize response here
        isRealtime: !responseData.fallback,
        dataTimestamp: responseData.dataTimestamp,
        usage: responseData.usage,
        error: responseData.error,
      }
    } catch (error) {
      console.error("AI query error:", error)
      setAiStatus("error")

      return {
        response: getLocalResponse(userQuery, error),
        isRealtime: false,
        error: error.message || "AI service temporarily unavailable",
      }
    }
  }

  // Local fallback responses (no recommendations)
  const getLocalResponse = (query, error) => {
    const lowerQuery = query.toLowerCase()

    if (lowerQuery.includes("order")) {
      return `Order data is being loaded. Information available once data refresh completes.`
    }
    if (lowerQuery.includes("contact")) {
      return `Contact data is being loaded. Information available once data refresh completes.`
    }
    if (lowerQuery.includes("template")) {
      return `Template data is being loaded. Information available once data refresh completes.`
    }
    if (lowerQuery.includes("inventory")) {
      return `Inventory data is being loaded. Information available once data refresh completes.`
    }

    return `GoWhats platform data is loading. Available modules: Orders, Messages, Contacts, Templates, Inventory, Broadcasts, Integrations, Bot, Flows, Users.`
  }

  const handleSendMessage = async () => {
    if (!inputText.trim()) return

    const userMessage = {
      id: Date.now(),
      type: "user",
      content: inputText.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    const userQuery = inputText.trim()
    setInputText("")

    try {
      const result = await processQuery(userQuery)

      const aiMessage = {
        id: Date.now() + 1,
        type: "ai",
        content: result.response,
        timestamp: new Date(),
        isRealtime: result.isRealtime,
        dataTimestamp: result.dataTimestamp,
        error: result.error,
      }

      setMessages((prev) => [...prev, aiMessage])

      if (result.isRealtime && result.response) {
        speakText(result.response)
      }
    } catch (error) {
      console.error("Message handling error:", error)
      const errorMessage = {
        id: Date.now() + 1,
        type: "ai",
        content: "Error processing request. Please check your authentication and try again.",
        timestamp: new Date(),
        isRealtime: false,
        error: error.message,
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleRefresh = async () => {
    const freshData = await fetchRealtimeData()
    if (freshData) {
      const refreshMessage = `Data refreshed successfully at ${new Date().toLocaleTimeString()}.

Available modules: ${Object.entries(freshData)
        .filter(([key]) => key !== "lastUpdated" && key !== "timestamp" && key !== "authContext")
        .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value ? "Active" : "Unavailable"}`)
        .join(", ")}`

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: "ai",
          content: sanitizeResponse(refreshMessage), // Sanitize refresh message
          timestamp: new Date(),
          isRealtime: true,
        },
      ])
    }
  }

  const getStatusIndicator = () => {
    switch (aiStatus) {
      case "processing":
        return { color: "bg-green-500", label: "Processing", icon: Loader, pulse: true }
      case "error":
        return { color: "bg-red-500", label: "Error", icon: AlertCircle, pulse: false }
      case "fallback":
        return { color: "bg-yellow-500", label: "Local Mode", icon: AlertCircle, pulse: false }
      case "ready":
        return { color: "bg-emerald-500", label: "Ready", icon: CheckCircle, pulse: false }
      default:
        return { color: "bg-gray-500", label: "Connecting", icon: Loader, pulse: true }
    }
  }

  const getAuthIndicator = () => {
    switch (authStatus) {
      case "authenticated":
        return { color: "bg-emerald-500", label: "Authenticated", icon: Shield }
      case "missing":
        return { color: "bg-red-500", label: "Auth Required", icon: AlertCircle }
      default:
        return { color: "bg-gray-500", label: "Checking", icon: Loader }
    }
  }

  const statusInfo = getStatusIndicator()
  const authInfo = getAuthIndicator()
  const StatusIcon = statusInfo.icon
  const AuthIcon = authInfo.icon

  // Enhanced Quick Actions - organized by module
  const quickActions = [
    // Core Business
    { label: "Today Orders", query: "Show today's orders", category: "business" },
    { label: "Revenue Stats", query: "What is this month's revenue", category: "business" },
    { label: "Order Status", query: "How many pending orders", category: "business" },

    // Communication
    { label: "Message Count", query: "How many messages sent today", category: "communication" },
    { label: "Contact Stats", query: "Show contact statistics", category: "communication" },
    { label: "Template Status", query: "How many approved templates", category: "communication" },

    // Operations
    { label: "Inventory Status", query: "Show inventory levels", category: "operations" },
    { label: "Stock Alerts", query: "Which products are low stock", category: "operations" },
    { label: "Integration Status", query: "Show connected integrations", category: "operations" },
  ]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-2 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md h-[600px] flex flex-col overflow-hidden">
        {/* Enhanced Header with Speech Toggle */}
        <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="flex items-center justify-center">
                  <img 
                    src={bot}   
                    alt="AI Assistant" 
                    className="w-14 h-14"
                  />
                </div>
              </div>
              <div>
                <h2 className="text-lg font-bold">VBot</h2>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <StatusIcon className="w-3 h-3" />
                    <span className="text-xs opacity-90">{statusInfo.label}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <AuthIcon className="w-3 h-3" />
                    <span className="text-xs opacity-75">{authInfo.label}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* Speech Toggle Button */}
              <button
                onClick={toggleSpeech}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-sm ${
                  isSpeechEnabled 
                    ? "bg-white bg-opacity-20 hover:bg-opacity-30 text-white" 
                    : "bg-red-500 bg-opacity-90 hover:bg-red-600 text-white"
                }`}
                title={isSpeechEnabled ? "Disable speech" : "Enable speech"}
              >
                {isSpeechEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
              
              <button
                onClick={handleRefresh}
                disabled={dataLoading}
                className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-all backdrop-blur-sm"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${dataLoading ? "animate-spin" : ""}`} />
              </button>
              
              <button
                onClick={onClose}
                className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-all backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Status Bar */}
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-2 border-b border-green-200">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <Database className="w-3 h-3 text-emerald-500" />
                <span className="font-medium text-gray-700">Data</span>
                <span className="text-gray-600">
                  {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Loading..."}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity className="w-3 h-3 text-green-500" />
                <span className="text-gray-600">
                  {realtimeData ? Object.values(realtimeData).filter((v) => v && typeof v === "object").length : 0}{" "}
                  modules
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-500">Auto-refresh: 30s</div>
          </div>
        </div>

        {/* Enhanced Quick Actions */}
        <div className="p-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-green-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-emerald-700">Quick Actions</h3>
            <button
              onClick={() => setShowQuickActions(!showQuickActions)}
              className="px-2 py-1 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600 transition-all shadow-sm flex items-center space-x-1"
            >
              <span>{showQuickActions ? "Hide" : "Show"}</span>
              <div className={`transform transition-transform ${showQuickActions ? "rotate-180" : ""}`}>▼</div>
            </button>
          </div>

          {showQuickActions && (
            <div className="grid grid-cols-3 gap-1 animate-in slide-in-from-top-2 duration-200">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => setInputText(action.query)}
                  className="px-2 py-1 bg-white border border-emerald-300 rounded text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-800 transition-all shadow-sm"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Enhanced Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-white to-emerald-50">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] p-3 rounded-xl shadow-sm ${
                  message.type === "user"
                    ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-br-sm"
                    : "bg-white border border-emerald-200 text-gray-800 rounded-bl-sm"
                }`}
              >
                {message.type === "ai" && (
                  <div className="flex items-center space-x-2 mb-2 pb-1 border-b border-emerald-100">
                    <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                      <Bot className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-xs font-medium text-emerald-600">VBot</span>
                    {message.isRealtime !== undefined && (
                      <span
                        className={`text-xs px-1 py-0.5 rounded-sm font-medium ${
                          message.isRealtime ? "bg-emerald-100 text-emerald-700" : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {message.isRealtime ? "Live Data" : "Local"}
                      </span>
                    )}
                  </div>
                )}

                <div className="text-xs leading-relaxed whitespace-pre-line">{message.content}</div>

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-emerald-100 border-opacity-50">
                  <div className="text-[11px] opacity-70 font-medium">
                    {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {message.dataTimestamp && (
                    <div className="text-xs opacity-60">
                    </div>
                  )}
                </div>

                {message.error && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    <div className="flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3" />
                      <span className="font-medium">Error:</span>
                      <span>{message.error}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-emerald-200 p-3 rounded-xl rounded-bl-sm shadow-sm max-w-[85%]">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Bot className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div className="flex items-center space-x-1">
                    <Loader className="w-3 h-3 text-emerald-600 animate-spin" />
                    <span className="text-xs text-gray-600 font-medium">
                      {aiStatus === "processing" ? "Processing your query..." : "typing..."}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Enhanced Input Section */}
        <div className="p-3 bg-white border-t border-emerald-200">
          <div className="flex items-end space-x-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  authStatus === "authenticated"
                    ? "Ask me anything…"
                    : "Please ensure you're logged in to use AI assistant"
                }
                className="w-full px-3 py-2 border border-emerald-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent text-xs resize-none bg-emerald-50 focus:bg-white transition-all"
                disabled={isLoading || authStatus !== "authenticated"}
                rows="1"
                style={{ minHeight: "40px", maxHeight: "80px" }}
              />
              {inputText.length > 0 && (
                <div className="absolute top-1 right-1 text-xs text-gray-400">{inputText.length}/500</div>
              )}
            </div>

            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isLoading || authStatus !== "authenticated"}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm disabled:opacity-50 ${
                isListening
                  ? "bg-red-500 text-white hover:bg-red-600 shadow-red-200"
                  : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200 border border-emerald-300"
              }`}
              title={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading || authStatus !== "authenticated"}
              className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl flex items-center justify-center hover:from-emerald-600 hover:to-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow shadow-emerald-200"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Enhanced Status Footer with Speech Status */}
          <div className="flex items-center justify-between mt-2 text-xs">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.color}`}></div>
                <span className="text-gray-600 font-medium">{statusInfo.label}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Shield className={`w-3 h-3 ${authStatus === "authenticated" ? "text-emerald-500" : "text-red-500"}`} />
                <span className={authStatus === "authenticated" ? "text-emerald-600" : "text-red-600"}>
                  {authInfo.label}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3 text-gray-500">
              <div className="flex items-center space-x-1">
                <Mic className="w-3 h-3" />
                <span>Voice</span>
              </div>
              <div className="flex items-center space-x-1">
                {isSpeechEnabled ? (
                  <Volume2 className="w-3 h-3 text-emerald-500" />
                ) : (
                  <VolumeX className="w-3 h-3 text-red-500" />
                )}
                <span className={isSpeechEnabled ? "text-emerald-600" : "text-red-600"}>
                  {isSpeechEnabled ? "Speech On" : "Speech Off"}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity className="w-3 h-3" />
                <span>Real-time</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIAssistant
