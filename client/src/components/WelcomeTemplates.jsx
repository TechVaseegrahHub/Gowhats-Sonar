"use client";

import React, { useState, useEffect, useRef } from "react";
import { publicApi } from "../utils/axios";
import {
  MessageSquare,
  Zap,
  CheckCircle,
  AlertCircle,
  Smile,
  Send,
  ExternalLink,
  Save,
} from "lucide-react";

export default function BotConfiguration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isBotActive, setIsBotActive] = useState(false);
  const [welcomeMessageType, setWelcomeMessageType] = useState("Interactive");
  const [headerText, setHeaderText] = useState("Welcome to Vaseegrah Veda!");
  const [messageBody, setMessageBody] = useState(
    "Ready to embrace the freshness of nature? Share us your Hair/Skin concerns, Our team will guide you to the perfect herbal solution"
  );
  const [triggerWordsInput, setTriggerWordsInput] = useState("hi, hello, hey, start, help");
  const [workflows, setWorkflows] = useState([
    { id: 1, workflow: "Visit Website", buttonText: "Visit Website", url: "https://techvaseegrah.com" },
    { id: 2, workflow: "Shop Our Collection", buttonText: "Shop Collection" },
    { id: 3, workflow: "Talk with Our Team", buttonText: "Talk with Team" },
    { id: 4, workflow: "Product Suggestions", buttonText: "Product Help" },
  ]);
  const [workflowMessages, setWorkflowMessages] = useState([
    { workflow: "Visit Website", message: "Here is our website: https://techvaseegrah.com Visit us to browse our products! 🙏", isCustomized: false },
    { workflow: "Shop Our Collection", message: "To shop our products, click the 'WhatsApp Shop' button above.", isCustomized: false },
    { workflow: "Talk with Our Team", message: "Hi 👋 Our customer support executive will get in touch with you soon.", isCustomized: false },
    { workflow: "Product Suggestions", message: "🤖 AI Assistant activated! Tell me what you're looking for.", isCustomized: false },
  ]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // ✅ Track button text errors
  const [buttonErrors, setButtonErrors] = useState({});

  const commonEmojis = ["😊","👍","🙏","❤️","🌿","✨","🎉","🌟","👋","🔥","💯","🤔","👏","🙌","😍","🎊"];

  useEffect(() => {
    fetchBotConfiguration();
  }, []);

  const showStatus = (msg, type = "success", ttl = 3000) => {
    setStatusMessage(msg);
    setStatusType(type);
    if (ttl > 0) setTimeout(() => setStatusMessage(""), ttl);
  };

  const getTenantIdFromLocal = () => {
    return (
      localStorage.getItem("tenant_id") ||
      localStorage.getItem("tenantId") ||
      localStorage.getItem("x-tenant-id")
    );
  };

  const fetchBotConfiguration = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const tenantId = getTenantIdFromLocal();
      if (!tenantId) throw new Error("Tenant ID not found in localStorage");

      const res = await publicApi.get("/api/welcome-message", {
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      });

      const cfg = res.data || {};
      setIsBotActive(cfg.isActive || false);
      setWelcomeMessageType(cfg.welcomeMessageType || "Interactive");
      setHeaderText(cfg.headerText ?? "");
      setMessageBody(cfg.messageBody ?? "");

      if (cfg.triggerWords && Array.isArray(cfg.triggerWords)) {
        setTriggerWordsInput(cfg.triggerWords.join(", "));
      }

      if (cfg.workflows && Array.isArray(cfg.workflows) && cfg.workflows.length) {
        setWorkflows(cfg.workflows.map((w, i) => ({
          id: w.id ?? Date.now() + i,
          workflow: w.workflow,
          buttonText: w.buttonText ?? w.workflow,
          url: w.url ?? "",
        })));
      }

      if (cfg.workflowMessages && Array.isArray(cfg.workflowMessages) && cfg.workflowMessages.length) {
        setWorkflowMessages(cfg.workflowMessages);
      }
    } catch (err) {
      console.error("fetchBotConfiguration error:", err);
      showStatus("Error fetching configuration", "error");
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: Direct async save function (no debounce, no useCallback issues)
  const saveConfig = async () => {
    // Validate button lengths before saving
    const errors = {};
    workflows.forEach((wf) => {
      if (wf.buttonText.length > 20) {
        errors[wf.id] = `Too long (${wf.buttonText.length}/20 chars)`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setButtonErrors(errors);
      showStatus("Fix button text lengths before saving (max 20 chars)", "error", 4000);
      return;
    }

    setButtonErrors({});

    try {
      setSaving(true);
      const token = localStorage.getItem("token");
      const tenantId = getTenantIdFromLocal();
      if (!token || !tenantId) throw new Error("Missing token or tenant ID");

      const payload = {
        welcomeMessageType,
        interactiveType: workflows.length > 3 ? "List" : "Button",
        headerText,
        messageBody,
        // ✅ Enforce 20 char max on save
        workflows: workflows.map(wf => ({
          ...wf,
          buttonText: wf.buttonText.substring(0, 20)
        })),
        workflowMessages,
        isActive: isBotActive,
        triggerWords: triggerWordsInput
          .split(",")
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean),
      };

      await publicApi.post("/api/welcome-message", payload, {
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      });

      showStatus("✅ Welcome message saved successfully!");
    } catch (err) {
      console.error("save error:", err);
      showStatus("Error saving configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleBotStatus = async () => {
    try {
      const newStatus = !isBotActive;
      const token = localStorage.getItem("token");
      const tenantId = getTenantIdFromLocal();
      if (!token || !tenantId) throw new Error("Missing token or tenant ID");

      await publicApi.post(
        "/api/welcome-message/bot-status",
        { isActive: newStatus },
        { headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId } }
      );

      setIsBotActive(newStatus);
      showStatus(`Bot is now ${newStatus ? "active ✅" : "inactive"}`);
    } catch (err) {
      console.error("toggleBotStatus error:", err);
      showStatus("Error updating bot status", "error");
    }
  };

  const addWorkflow = (type) => {
    const nextId = Date.now();
    // ✅ Default button text already within 20 chars
    const defaultButtonText = {
      "Visit Website": "Visit Website",
      "Shop Our Collection": "Shop Collection",
      "Talk with Our Team": "Talk with Team",
      "Product Suggestions": "Product Help",
    };
    const wf = {
      id: nextId,
      workflow: type,
      buttonText: defaultButtonText[type] || type.substring(0, 20),
      url: type === "Visit Website" ? "https://" : "",
    };
    setWorkflows((p) => [...p, wf]);
  };

  const updateWorkflowField = (id, field, value) => {
    if (field === "buttonText") {
      // ✅ Clear error when user edits
      if (value.length <= 20) {
        setButtonErrors((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
      } else {
        setButtonErrors((prev) => ({
          ...prev,
          [id]: `Too long (${value.length}/20 chars)`,
        }));
      }
    }
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );
  };

  const removeWorkflow = (id) => {
    if (workflows.length <= 1) return;
    const removed = workflows.find((w) => w.id === id);
    setWorkflows((p) => p.filter((w) => w.id !== id));
    if (removed) {
      setWorkflowMessages((p) => p.filter((m) => m.workflow !== removed.workflow));
    }
    setButtonErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const updateWorkflowMessage = (workflow, message) => {
    setWorkflowMessages((prev) => {
      const idx = prev.findIndex((m) => m.workflow === workflow);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], message, isCustomized: true };
        return copy;
      }
      return [...prev, { workflow, message, isCustomized: true }];
    });
  };

  const getWorkflowMessage = (workflow) =>
    workflowMessages.find((m) => m.workflow === workflow)?.message ?? "";

  const addEmoji = (emoji) => {
    setMessageBody((s) => (s.endsWith(" ") || s === "" ? s + emoji : s + " " + emoji));
    setShowEmojiPicker(false);
  };

  const availableWorkflowTypes = [
    "Visit Website",
    "Shop Our Collection",
    "Talk with Our Team",
    "Product Suggestions",
  ];

  // Check if any button text exceeds limit
  const hasButtonErrors = Object.keys(buttonErrors).length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin h-16 w-16 rounded-full border-4 border-green-200 border-t-emerald-400 mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <p className="mt-4 text-gray-700 font-medium">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Status notification */}
      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 px-3 py-2 rounded-lg shadow-lg max-w-[320px] ${
            statusType === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusType === "error" ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="font-medium text-sm break-words">{statusMessage}</span>
          </div>
        </div>
      )}

      <div className="w-full max-w-[1500px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-emerald-600 p-2 rounded-lg flex-shrink-0">
              <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-semibold text-gray-900 truncate">
                Welcome Message Hub
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 truncate">
                Configure your welcome message and preview it in real time
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-2 sm:gap-3 bg-white px-3 py-2 rounded-lg border shadow-sm text-sm ml-auto">
            <Zap className={`w-4 h-4 sm:w-5 sm:h-5 ${isBotActive ? "text-emerald-600" : "text-gray-400"}`} />
            <button
              onClick={toggleBotStatus}
              aria-pressed={isBotActive}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ${
                isBotActive ? "bg-emerald-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transform transition ${
                  isBotActive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`font-medium whitespace-nowrap ${isBotActive ? "text-emerald-600" : "text-gray-600"}`}>
              {isBotActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px] gap-4 sm:gap-6 items-start">

          {/* ── LEFT: Config Panel ── */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 sm:p-5 overflow-auto max-h-[calc(100vh-140px)]">
            <div className="space-y-4 text-sm">

              {/* Welcome Message Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Welcome message type</label>
                <select
                  value={welcomeMessageType}
                  onChange={(e) => setWelcomeMessageType(e.target.value)}
                  className="w-full p-2 rounded-lg border text-sm bg-white"
                >
                  <option>Interactive</option>
                  <option>Simple Text</option>
                </select>
              </div>

              {/* Trigger Words */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Trigger Words</label>
                <textarea
                  value={triggerWordsInput}
                  onChange={(e) => setTriggerWordsInput(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded-lg border text-sm bg-white resize-none"
                  placeholder="hi, hello, hey"
                />
                <p className="text-xs text-gray-500 mt-1">Separate words with commas</p>
              </div>

              {/* Header Text */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Header Text</label>
                <input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  className="w-full p-2 rounded-lg border text-sm bg-white"
                  maxLength={60}
                />
                <p className={`text-xs mt-1 ${headerText.length >= 55 ? "text-orange-500" : "text-gray-500"}`}>
                  {headerText.length} / 60
                </p>
              </div>

              {/* Message Body */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Message Body</label>
                <textarea
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  rows={4}
                  className="w-full p-2 rounded-lg border text-sm bg-white resize-none"
                  maxLength={1024}
                />
                <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                  <span className={messageBody.length >= 950 ? "text-orange-500" : ""}>
                    {messageBody.length} / 1024
                  </span>
                  <button
                    onClick={() => setShowEmojiPicker((s) => !s)}
                    className="px-2 py-1 bg-white border rounded text-xs hover:bg-gray-50"
                  >
                    Add Emoji
                  </button>
                </div>
                {showEmojiPicker && (
                  <div className="mt-2 grid grid-cols-8 gap-1 p-2 bg-white border rounded-lg">
                    {commonEmojis.map((em) => (
                      <button
                        key={em}
                        onClick={() => addEmoji(em)}
                        className="p-1.5 rounded hover:bg-gray-100 text-base transition-colors"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Interactive Actions */}
              {welcomeMessageType === "Interactive" && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Interactive Actions</h3>
                    <select
                      onChange={(e) => { const val = e.target.value; if (val) addWorkflow(val); e.target.value = ""; }}
                      defaultValue=""
                      className="text-xs p-1.5 border rounded bg-white"
                    >
                      <option value="">Add action...</option>
                      {availableWorkflowTypes
                        .filter((t) => !workflows.some((w) => w.workflow === t))
                        .map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* ✅ Warning banner if any button text is too long */}
                  {hasButtonErrors && (
                    <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Button text too long!</p>
                        <p className="text-xs text-red-600">WhatsApp allows max 20 characters per button. Please shorten the highlighted buttons.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {workflows.map((wf) => {
                      const hasError = !!buttonErrors[wf.id];
                      const charCount = wf.buttonText.length;
                      const isNearLimit = charCount >= 17 && charCount <= 20;
                      const isOverLimit = charCount > 20;

                      return (
                        <div
                          key={wf.id}
                          className={`bg-white p-3 rounded-lg border space-y-2 ${hasError ? "border-red-400 bg-red-50" : ""}`}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Button Text
                                {isOverLimit && (
                                  <span className="ml-1 text-red-500 font-semibold">⚠ Too long!</span>
                                )}
                              </label>
                              <input
                                value={wf.buttonText}
                                onChange={(e) => updateWorkflowField(wf.id, "buttonText", e.target.value)}
                                className={`w-full p-1.5 rounded border text-xs ${
                                  isOverLimit
                                    ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-300"
                                    : isNearLimit
                                    ? "border-orange-400 bg-orange-50"
                                    : "bg-gray-50"
                                }`}
                                placeholder="Max 20 characters"
                              />
                              {/* ✅ Character counter */}
                              <p className={`text-xs mt-0.5 font-medium ${
                                isOverLimit ? "text-red-600" : isNearLimit ? "text-orange-500" : "text-gray-400"
                              }`}>
                                {charCount}/20
                                {isOverLimit && ` — shorten by ${charCount - 20} char${charCount - 20 > 1 ? "s" : ""}`}
                              </p>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Action Type</label>
                              <select
                                value={wf.workflow}
                                onChange={(e) => updateWorkflowField(wf.id, "workflow", e.target.value)}
                                className="w-full p-1.5 rounded border text-xs bg-gray-50"
                              >
                                <option value="Visit Website">Visit Website</option>
                                <option value="Shop Our Collection">Shop Our Collection</option>
                                <option value="Talk with Our Team">Talk With Our Team</option>
                                <option value="Product Suggestions">Product Suggestions</option>
                              </select>
                            </div>
                          </div>
                          {wf.workflow === "Visit Website" && (
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Website URL</label>
                              <input
                                type="url"
                                value={wf.url || ""}
                                onChange={(e) => updateWorkflowField(wf.id, "url", e.target.value)}
                                placeholder="https://example.com"
                                className="w-full p-1.5 rounded border text-xs bg-gray-50"
                              />
                            </div>
                          )}
                          {workflows.length > 1 && (
                            <div className="flex justify-end">
                              <button
                                onClick={() => removeWorkflow(wf.id)}
                                className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Response Messages */}
              {welcomeMessageType === "Interactive" && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Custom Response Messages</h3>
                  <div className="space-y-3">
                    {workflows.filter((w) => w.workflow !== "Visit Website").map((w) => (
                      <div key={w.workflow} className="bg-white p-3 rounded-lg border">
                        <label className="block text-xs text-gray-600 mb-1">{w.workflow} response</label>
                        <textarea
                          value={getWorkflowMessage(w.workflow)}
                          onChange={(e) => updateWorkflowMessage(w.workflow, e.target.value)}
                          rows={2}
                          className="w-full p-1.5 rounded border text-xs bg-gray-50 resize-none"
                        />
                        <div className="text-xs text-gray-400 mt-1">
                          Characters: {getWorkflowMessage(w.workflow).length}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ✅ FIXED Save Button - desktop */}
              <div className="pt-2 hidden sm:block">
                <button
                  onClick={saveConfig}
                  disabled={saving || hasButtonErrors}
                  className={`w-full py-2.5 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    hasButtonErrors
                      ? "bg-gray-400 cursor-not-allowed"
                      : saving
                      ? "bg-emerald-400 cursor-wait"
                      : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]"
                  }`}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Configuration
                    </>
                  )}
                </button>
                {hasButtonErrors && (
                  <p className="text-xs text-red-500 text-center mt-1">
                    Fix button text lengths to enable saving
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Phone Preview ── */}
          <div className="lg:sticky lg:top-4">
            <div className="bg-white rounded-xl border shadow-sm p-3 sm:p-4">
              <div className="text-center mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Live Preview</h3>
                <p className="text-xs text-gray-500">Real-time preview of the welcome message</p>
              </div>

              {/* Phone Shell */}
              <div className="flex justify-center">
                <div
                  className="relative flex flex-col rounded-[2rem] overflow-hidden border-[6px] border-gray-800 bg-gray-800 shadow-2xl"
                  style={{ width: 260, height: 520 }}
                >
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-800 rounded-b-xl z-10" />

                  {/* Screen */}
                  <div className="flex flex-col flex-1 bg-gray-100 overflow-hidden rounded-[1.4rem]">

                    {/* WhatsApp top bar */}
                    <div className="bg-[#075e54] text-white px-3 pt-6 pb-2 flex items-center gap-2 flex-shrink-0">
                      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <path d="M10 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] font-bold text-white">W</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold truncate leading-none">WhatsApp Chat</div>
                        <div className="text-[8px] text-emerald-200 leading-none mt-0.5">online</div>
                      </div>
                    </div>

                    {/* Chat area */}
                    <div
                      className="flex-1 overflow-y-auto px-2 py-3"
                      style={{
                        backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d1fae5' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                        backgroundColor: "#e5ddd5",
                      }}
                    >
                      <div className="flex justify-start">
                        <div className="bg-white rounded-lg rounded-tl-none shadow-sm px-2.5 py-2 max-w-[92%]" style={{ minWidth: 120 }}>
                          {headerText && (
                            <div className="text-[10px] font-bold text-gray-900 mb-1 leading-tight">{headerText}</div>
                          )}
                          <div className="text-[10px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{messageBody}</div>
                          <div className="text-right text-[8px] text-gray-400 mt-1">Just now ✓✓</div>
                        </div>
                      </div>

                      {welcomeMessageType === "Interactive" && workflows.length > 0 && (
                        <div className="mt-1 space-y-1 max-w-[92%]">
                          {workflows.map((w) => (
                            <div
                              key={w.id}
                              className={`flex items-center justify-center gap-1 w-full py-1.5 border rounded-lg shadow-sm ${
                                w.buttonText.length > 20 ? "bg-red-50 border-red-300" : "bg-white border-gray-200"
                              }`}
                            >
                              <span className={`text-[9px] font-medium truncate px-1 ${
                                w.buttonText.length > 20 ? "text-red-600" : "text-[#075e54]"
                              }`}>
                                {w.buttonText.length > 20
                                  ? `⚠ ${w.buttonText.substring(0, 20)}...`
                                  : w.buttonText}
                              </span>
                              {w.workflow === "Visit Website" && w.url && (
                                <ExternalLink className="w-2 h-2 text-[#075e54] flex-shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Input bar */}
                    <div className="bg-[#f0f0f0] px-2 py-1.5 flex items-center gap-1.5 flex-shrink-0">
                      <Smile className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <div className="flex-1 bg-white rounded-full px-2 py-1 text-[9px] text-gray-400">Type a message</div>
                      <div className="bg-[#075e54] rounded-full p-1.5 flex-shrink-0">
                        <Send className="w-2.5 h-2.5 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ FIXED: Floating Save on mobile */}
        <div className="sm:hidden">
          <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 w-[min(92%,420px)]">
            <button
              onClick={saveConfig}
              disabled={saving || hasButtonErrors}
              className={`w-full py-3 rounded-full text-white font-medium shadow-lg flex items-center justify-center gap-2 transition-all ${
                hasButtonErrors
                  ? "bg-gray-400 cursor-not-allowed"
                  : saving
                  ? "bg-emerald-400"
                  : "bg-emerald-600"
              }`}
            >
              {saving ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {hasButtonErrors ? "Fix errors to save" : "Save Configuration"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
