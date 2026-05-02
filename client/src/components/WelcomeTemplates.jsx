import React, { useState, useEffect } from "react";
import { publicApi } from "../utils/axios";
import {
  MessageSquare, Zap, CheckCircle, AlertCircle,
  Save, ExternalLink, Plus, Trash2, List, LayoutGrid,
  Info, Globe, ShoppingBag, Users, Lightbulb
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const WORKFLOW_TYPES = [
  "Visit Website",
  "Shop Our Collection",
  "Talk with Our Team",
  "Product Suggestions",
];

const WORKFLOW_ICONS = {
  "Visit Website": Globe,
  "Shop Our Collection": ShoppingBag,
  "Talk with Our Team": Users,
  "Product Suggestions": Lightbulb,
};

const WORKFLOW_COLORS = {
  "Visit Website": "bg-blue-50 border-blue-200 text-blue-700",
  "Shop Our Collection": "bg-purple-50 border-purple-200 text-purple-700",
  "Talk with Our Team": "bg-orange-50 border-orange-200 text-orange-700",
  "Product Suggestions": "bg-emerald-50 border-emerald-200 text-emerald-700",
};

const DEFAULT_BUTTON_TEXTS = {
  "Visit Website": "Visit Website",
  "Shop Our Collection": "Shop Collection",
  "Talk with Our Team": "Talk with Team",
  "Product Suggestions": "Product Help",
};

const COMMON_EMOJIS = ["😊","👍","🙏","❤️","🌿","✨","🎉","🌟","👋","🔥","💯","🤔","👏","🙌","😍","💚"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTenantId = () =>
  localStorage.getItem("tenant_id") ||
  localStorage.getItem("tenantId") ||
  localStorage.getItem("x-tenant-id");

const getToken = () => localStorage.getItem("token");

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusToast({ message, type }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl border w-max max-w-sm text-sm font-medium transition-all
        ${type === "error"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-emerald-50 text-emerald-800 border-emerald-200"}`}
    >
      {type === "error"
        ? <AlertCircle className="w-4 h-4 flex-shrink-0" />
        : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
      <span className="break-words">{message}</span>
    </div>
  );
}

function ModeToggle({ mode, onChange, buttonCount }) {
  // Button mode: max 3 | List mode: max 4
  return (
    <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
      <button
        onClick={() => onChange("Button")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          mode === "Button"
            ? "bg-white text-emerald-700 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Button
        <span className="text-[10px] font-normal opacity-70">max 3</span>
      </button>
      <button
        onClick={() => onChange("List")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          mode === "List"
            ? "bg-white text-emerald-700 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        <List className="w-3.5 h-3.5" />
        List
        <span className="text-[10px] font-normal opacity-70">max 4</span>
      </button>
    </div>
  );
}

function WorkflowCard({ wf, index, onUpdate, onRemove, canRemove, mode }) {
  const Icon = WORKFLOW_ICONS[wf.workflow] || Globe;
  const colorClass = WORKFLOW_COLORS[wf.workflow] || "bg-gray-50 border-gray-200 text-gray-700";
  const charCount = wf.buttonText?.length || 0;
  const isOverLimit = charCount > 20;
  const isNearLimit = charCount >= 17 && charCount <= 20;
  const maxAllowed = mode === "Button" ? 3 : 4;

  return (
    <div className={`rounded-xl border-2 p-3 transition-all ${isOverLimit ? "border-red-300 bg-red-50" : "border-gray-100 bg-white"}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
          <Icon className="w-3 h-3" />
          {wf.workflow}
        </div>
        {canRemove && (
          <button
            onClick={() => onRemove(wf.id)}
            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Button Text */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
            Button Label
          </label>
          <input
            value={wf.buttonText}
            onChange={(e) => onUpdate(wf.id, "buttonText", e.target.value)}
            maxLength={25}
            placeholder="Max 20 chars"
            className={`w-full px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
              isOverLimit
                ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-200"
                : isNearLimit
                ? "border-orange-300 bg-orange-50"
                : "border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white"
            } outline-none focus:ring-2 focus:ring-emerald-100`}
          />
          <div className={`text-[10px] mt-0.5 font-medium ${isOverLimit ? "text-red-600" : isNearLimit ? "text-orange-500" : "text-gray-400"}`}>
            {charCount}/20
            {isOverLimit && ` — shorten by ${charCount - 20}`}
          </div>
        </div>

        {/* Action Type */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
            Action
          </label>
          <select
            value={wf.workflow}
            onChange={(e) => onUpdate(wf.id, "workflow", e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            {WORKFLOW_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* URL field for Visit Website */}
      {wf.workflow === "Visit Website" && (
        <div className="mt-2">
          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
            Website URL <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <ExternalLink className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="url"
              value={wf.url || ""}
              onChange={(e) => onUpdate(wf.id, "url", e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full pl-7 pr-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
          {wf.url && !wf.url.startsWith("http") && (
            <p className="text-[10px] text-orange-500 mt-0.5">URL should start with https://</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Phone Preview ────────────────────────────────────────────────────────────

function PhonePreview({ headerText, messageBody, workflows, interactiveType, welcomeMessageType }) {
  return (
    <div className="flex justify-center">
      <div
        className="relative flex flex-col rounded-[2rem] overflow-hidden border-[6px] border-gray-800 bg-gray-800 shadow-2xl"
        style={{ width: 256, height: 520 }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-800 rounded-b-xl z-10" />

        {/* Screen */}
        <div className="flex flex-col flex-1 overflow-hidden rounded-[1.4rem]">
          {/* WhatsApp bar */}
          <div className="bg-[#075e54] text-white px-3 pt-6 pb-2 flex items-center gap-2 flex-shrink-0">
            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M10 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
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
            style={{ backgroundColor: "#e5ddd5" }}
          >
            <div className="flex justify-start">
              <div className="bg-white rounded-lg rounded-tl-none shadow-sm px-2.5 py-2 max-w-[95%]">
                {headerText && (
                  <div className="text-[10px] font-bold text-gray-900 mb-1 leading-tight">{headerText}</div>
                )}
                <div className="text-[9px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                  {messageBody || "Your message will appear here..."}
                </div>
                <div className="text-right text-[8px] text-gray-400 mt-1">Just now ✓✓</div>
              </div>
            </div>

            {/* Button mode preview */}
            {welcomeMessageType === "Interactive" && interactiveType === "Button" && workflows.length > 0 && (
              <div className="mt-1.5 space-y-1 max-w-[95%]">
                {workflows.slice(0, 3).map((w) => {
                  const over = w.buttonText?.length > 20;
                  return (
                    <div
                      key={w.id}
                      className={`flex items-center justify-center gap-1 w-full py-1.5 border rounded-lg shadow-sm ${
                        over ? "bg-red-50 border-red-300" : "bg-white border-gray-200"
                      }`}
                    >
                      <span className={`text-[9px] font-semibold px-1 ${over ? "text-red-600" : "text-[#075e54]"}`}>
                        {over ? `⚠ ${w.buttonText.substring(0, 17)}...` : w.buttonText}
                      </span>
                      {w.workflow === "Visit Website" && w.url && (
                        <ExternalLink className="w-2 h-2 text-[#075e54] flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* List mode preview */}
            {welcomeMessageType === "Interactive" && interactiveType === "List" && workflows.length > 0 && (
              <div className="mt-1.5 max-w-[95%]">
                <div className="w-full py-1.5 border border-gray-200 rounded-lg bg-white shadow-sm flex items-center justify-center gap-1">
                  <List className="w-2.5 h-2.5 text-[#075e54]" />
                  <span className="text-[9px] font-semibold text-[#075e54]">View options</span>
                </div>
                <div className="mt-1 text-[8px] text-gray-500 text-center">
                  {workflows.length} option{workflows.length !== 1 ? "s" : ""} in list
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="bg-[#f0f0f0] px-2 py-1.5 flex items-center gap-1.5 flex-shrink-0">
            <div className="w-4 h-4 rounded-full bg-gray-400 flex-shrink-0" />
            <div className="flex-1 bg-white rounded-full px-2 py-1 text-[8px] text-gray-400">Type a message</div>
            <div className="bg-[#075e54] rounded-full p-1.5 flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-white opacity-80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BotConfiguration() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isBotActive, setIsBotActive] = useState(false);
  const [welcomeMessageType, setWelcomeMessageType] = useState("Interactive");
  const [interactiveType, setInteractiveType] = useState("Button");
  const [headerText, setHeaderText] = useState("Welcome to Vaseegrah Veda!");
  const [messageBody, setMessageBody] = useState(
    "Ready to embrace the freshness of nature? Share us your Hair/Skin concerns, Our team will guide you to the perfect herbal solution tailored for you! 🌿✨"
  );
  const [triggerWordsInput, setTriggerWordsInput] = useState("hi, hello, hey, start, help");
  const [workflows, setWorkflows] = useState([
    { id: 1, workflow: "Visit Website", buttonText: "Visit Website", url: "" },
    { id: 2, workflow: "Shop Our Collection", buttonText: "Shop Collection", url: "" },
    { id: 3, workflow: "Talk with Our Team", buttonText: "Talk with Team", url: "" },
  ]);
  const [workflowMessages, setWorkflowMessages] = useState([
    { workflow: "Visit Website", message: "Click the link below to visit our website! 🙏", url: null, isCustomized: false },
    { workflow: "Shop Our Collection", message: "To shop our products, click the 'WhatsApp Shop' button above.", url: null, isCustomized: false },
    { workflow: "Talk with Our Team", message: "Hi 👋 Our customer support executive will get in touch with you soon. We appreciate your patience! ❤️", url: null, isCustomized: false },
    { workflow: "Product Suggestions", message: "🤖 AI Assistant activated! I'm here to help you find the perfect products.", url: null, isCustomized: false },
  ]);
  const [buttonErrors, setButtonErrors] = useState({});
  const [urlErrors, setUrlErrors] = useState({});
  const [showEmoji, setShowEmoji] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success");
  const [togglingBot, setTogglingBot] = useState(false);

  // Limits per mode
  const maxWorkflows = interactiveType === "Button" ? 3 : 4;

  // ── Load config ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchConfig();
  }, []);

  const showStatus = (msg, type = "success", ttl = 4000) => {
    setStatusMessage(msg);
    setStatusType(type);
    if (ttl > 0) setTimeout(() => setStatusMessage(""), ttl);
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const tenantId = getTenantId();
      if (!tenantId) throw new Error("Your session has expired. Please log in again.");

      const res = await publicApi.get("/api/welcome-message", {
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      });

      const cfg = res.data || {};
      setIsBotActive(cfg.isActive || false);
      setWelcomeMessageType(cfg.welcomeMessageType || "Interactive");
      setInteractiveType(cfg.interactiveType || "Button");
      setHeaderText(cfg.headerText ?? "Welcome to Vaseegrah Veda!");
      setMessageBody(cfg.messageBody ?? "");

      if (Array.isArray(cfg.triggerWords) && cfg.triggerWords.length) {
        setTriggerWordsInput(cfg.triggerWords.join(", "));
      }

      if (Array.isArray(cfg.workflows) && cfg.workflows.length) {
        setWorkflows(
          cfg.workflows.map((w, i) => ({
            id: w.id ?? Date.now() + i,
            workflow: w.workflow,
            buttonText: w.buttonText ?? w.workflow,
            url: w.url ?? "",
          }))
        );
      }

      if (Array.isArray(cfg.workflowMessages) && cfg.workflowMessages.length) {
        setWorkflowMessages(cfg.workflowMessages);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message;
      showStatus(`Could not load your settings. ${msg}`, "error", 6000);
    } finally {
      setLoading(false);
    }
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = () => {
    const bErrors = {};
    const uErrors = {};

    workflows.forEach((wf) => {
      if (!wf.buttonText?.trim()) {
        bErrors[wf.id] = "Button label cannot be empty";
      } else if (wf.buttonText.length > 20) {
        bErrors[wf.id] = `Too long — max 20 characters (currently ${wf.buttonText.length})`;
      }
      if (wf.workflow === "Visit Website") {
        if (!wf.url?.trim()) {
          uErrors[wf.id] = "Please add a website URL for this button";
        } else if (!wf.url.startsWith("http://") && !wf.url.startsWith("https://")) {
          uErrors[wf.id] = "URL must start with https://";
        }
      }
    });

    setButtonErrors(bErrors);
    setUrlErrors(uErrors);
    return Object.keys(bErrors).length === 0 && Object.keys(uErrors).length === 0;
  };

  const hasErrors = Object.keys(buttonErrors).length > 0 || Object.keys(urlErrors).length > 0;

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveConfig = async () => {
    if (!validate()) {
      showStatus("Please fix the highlighted errors before saving.", "error");
      return;
    }

    try {
      setSaving(true);
      const token = getToken();
      const tenantId = getTenantId();
      if (!token || !tenantId) {
        showStatus("Your session has expired. Please refresh the page and log in again.", "error", 7000);
        return;
      }

      // Sync Visit Website URL from workflow into workflowMessages
      const visitWebsiteWf = workflows.find((w) => w.workflow === "Visit Website");
      const syncedMessages = workflowMessages.map((msg) => {
        if (msg.workflow === "Visit Website" && visitWebsiteWf) {
          return { ...msg, url: visitWebsiteWf.url || null };
        }
        return msg;
      });

      const payload = {
        welcomeMessageType,
        interactiveType,
        headerText,
        messageBody,
        workflows: workflows.map((wf) => ({
          workflow: wf.workflow,
          buttonText: wf.buttonText.substring(0, 20),
          url: wf.url || null,
        })),
        workflowMessages: syncedMessages,
        isActive: isBotActive,
        triggerWords: triggerWordsInput
          .split(",")
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean),
      };

      await publicApi.post("/api/welcome-message", payload, {
        headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      });

      showStatus("✅ Configuration saved successfully!");
    } catch (err) {
      const detail =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err.message;

      // User-friendly error messages
      if (err?.response?.status === 401) {
        showStatus("Your session has expired. Please log in again.", "error", 7000);
     } else if (err?.response?.status === 400) {
	  const friendly = detail
	    ?.replace(/Invalid URL in workflowMessages for Visit Website\. Must be http or https\./i,
	      "Please add a valid website URL (e.g. https://yoursite.com) for the Visit Website button.")
	    ?.replace(/Invalid URL.*Must be http or https/i,
	      "Please add a valid website URL starting with https:// for the Visit Website button.");
	  showStatus(friendly || `Validation error: ${detail}`, "error", 7000);

      } else if (err?.response?.status >= 500) {
        showStatus("Server error. Please try again in a moment.", "error", 7000);
      } else {
        showStatus(`Could not save: ${detail}`, "error", 7000);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle bot ─────────────────────────────────────────────────────────────

  const toggleBot = async () => {
    try {
      setTogglingBot(true);
      const newStatus = !isBotActive;
      const token = getToken();
      const tenantId = getTenantId();

      await publicApi.post(
        "/api/welcome-message/bot-status",
        { isActive: newStatus },
        { headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId } }
      );

      setIsBotActive(newStatus);
      showStatus(
        newStatus
          ? "✅ Welcome bot is now active — it will greet your customers!"
          : "Bot paused — no welcome messages will be sent.",
        "success"
      );
    } catch (err) {
      if (err?.response?.status === 401) {
        showStatus("Session expired. Please log in again.", "error");
      } else {
        showStatus("Could not update bot status. Please try again.", "error");
      }
    } finally {
      setTogglingBot(false);
    }
  };

  // ── Interactive type change ────────────────────────────────────────────────

  const handleInteractiveTypeChange = (newType) => {
    const max = newType === "Button" ? 3 : 4;
    setInteractiveType(newType);
    // Trim workflows if over limit
    if (workflows.length > max) {
      setWorkflows((prev) => prev.slice(0, max));
      showStatus(`Switched to ${newType} mode — trimmed to ${max} actions.`, "success");
    }
  };

  // ── Workflow management ────────────────────────────────────────────────────

  const addWorkflow = (type) => {
    if (workflows.length >= maxWorkflows) return;
    const newWf = {
      id: Date.now(),
      workflow: type,
      buttonText: DEFAULT_BUTTON_TEXTS[type] || type.substring(0, 20),
      url: type === "Visit Website" ? "" : "",
    };
    setWorkflows((prev) => [...prev, newWf]);
  };

  const updateWorkflow = (id, field, value) => {
    if (field === "buttonText") {
      if (value.length <= 20) {
        setButtonErrors((prev) => { const c = { ...prev }; delete c[id]; return c; });
      } else {
        setButtonErrors((prev) => ({ ...prev, [id]: `Too long — max 20 characters (currently ${value.length})` }));
      }
    }
    if (field === "url") {
      if (value && (value.startsWith("http://") || value.startsWith("https://"))) {
        setUrlErrors((prev) => { const c = { ...prev }; delete c[id]; return c; });
      }
    }
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)));
  };

  const removeWorkflow = (id) => {
    if (workflows.length <= 1) {
      showStatus("You need at least one action button.", "error");
      return;
    }
    const removed = workflows.find((w) => w.id === id);
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    if (removed) setWorkflowMessages((prev) => prev.filter((m) => m.workflow !== removed.workflow));
    setButtonErrors((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setUrlErrors((prev) => { const c = { ...prev }; delete c[id]; return c; });
  };

  // ── Workflow messages ──────────────────────────────────────────────────────

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

  // ── Emoji ──────────────────────────────────────────────────────────────────

  const addEmoji = (emoji) => {
    setMessageBody((s) => (s.endsWith(" ") || s === "" ? s + emoji : s + " " + emoji));
    setShowEmoji(false);
  };

  // ── Available types to add ─────────────────────────────────────────────────

  const usedTypes = workflows.map((w) => w.workflow);
  const availableToAdd = WORKFLOW_TYPES.filter((t) => !usedTypes.includes(t));

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="animate-spin w-16 h-16 rounded-full border-4 border-emerald-100 border-t-emerald-500" />
            <div className="absolute inset-0 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <p className="text-gray-600 font-medium text-sm">Loading your welcome message settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <StatusToast message={statusMessage} type={statusType} />

      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2.5 rounded-xl shadow-sm">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Welcome Message Hub</h1>
              <p className="text-xs text-gray-500">Configure what customers see when they first message you</p>
            </div>
          </div>

          {/* Bot toggle */}
          <button
            onClick={toggleBot}
            disabled={togglingBot}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border shadow-sm text-sm font-medium transition-all ${
              isBotActive
                ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            } disabled:opacity-60`}
          >
            <Zap className={`w-4 h-4 ${isBotActive ? "text-emerald-600" : "text-gray-400"}`} />
            <div
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isBotActive ? "bg-emerald-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  isBotActive ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </div>
            <span>{togglingBot ? "Updating..." : isBotActive ? "Active" : "Inactive"}</span>
          </button>
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px] gap-5 items-start">

          {/* LEFT: Config */}
          <div className="space-y-4">

            {/* Message Settings card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-4">Message Settings</h2>

              <div className="space-y-4 text-sm">
                {/* Message Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Message Type</label>
                  <select
                    value={welcomeMessageType}
                    onChange={(e) => setWelcomeMessageType(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="Interactive">Interactive (with buttons)</option>
                    <option value="Simple Text">Simple Text (no buttons)</option>
                  </select>
                </div>

                {/* Trigger Words */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Trigger Words
                    <span className="ml-1.5 text-gray-400 font-normal">(comma separated)</span>
                  </label>
                  <textarea
                    value={triggerWordsInput}
                    onChange={(e) => setTriggerWordsInput(e.target.value)}
                    rows={2}
                    placeholder="hi, hello, hey, start, help"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white resize-none outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Your welcome message is sent when a customer types any of these words
                  </p>
                </div>

                {/* Header Text */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Header Text</label>
                  <input
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    maxLength={60}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <p className={`text-[11px] mt-1 ${headerText.length >= 55 ? "text-orange-500" : "text-gray-400"}`}>
                    {headerText.length}/60 characters
                  </p>
                </div>

                {/* Message Body */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-600">Message Body</label>
                    <button
                      onClick={() => setShowEmoji((s) => !s)}
                      className="text-xs px-2 py-0.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                    >
                      😊 Emoji
                    </button>
                  </div>
                  <textarea
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    rows={4}
                    maxLength={1024}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className={`text-[11px] ${messageBody.length >= 950 ? "text-orange-500" : "text-gray-400"}`}>
                      {messageBody.length}/1024 characters
                    </p>
                    {messageBody.includes("**") && (
                      <p className="text-[11px] text-orange-500">
                        ⚠ Use *single asterisk* for bold text in WhatsApp
                      </p>
                    )}
                  </div>

                  {showEmoji && (
                    <div className="mt-2 grid grid-cols-8 gap-1 p-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                      {COMMON_EMOJIS.map((em) => (
                        <button
                          key={em}
                          onClick={() => addEmoji(em)}
                          className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-base transition-all"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive Actions card */}
            {welcomeMessageType === "Interactive" && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-gray-800">Action Buttons</h2>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {interactiveType === "Button"
                        ? "Button mode: max 3 buttons, each visible directly"
                        : "List mode: up to 4 options shown in a scrollable list"}
                    </p>
                  </div>
                  <ModeToggle
                    mode={interactiveType}
                    onChange={handleInteractiveTypeChange}
                    buttonCount={workflows.length}
                  />
                </div>

                {/* Info banner */}
                <div className={`flex items-start gap-2 p-3 rounded-xl mb-4 text-xs ${
                  interactiveType === "Button"
                    ? "bg-blue-50 border border-blue-100 text-blue-700"
                    : "bg-violet-50 border border-violet-100 text-violet-700"
                }`}>
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {interactiveType === "Button"
                    ? "Buttons appear directly below your message — best for 1–3 clear choices."
                    : "List shows a 'View options' button that opens a scrollable menu — ideal for 4 options."}
                </div>

                {/* Error banner */}
                {(Object.keys(buttonErrors).length > 0 || Object.keys(urlErrors).length > 0) && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-xs text-red-700">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Please fix these issues before saving:</p>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        {Object.values(buttonErrors).map((e, i) => <li key={i}>{e}</li>)}
                        {Object.values(urlErrors).map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Workflow cards */}
                <div className="space-y-3">
                  {workflows.map((wf) => (
                    <WorkflowCard
                      key={wf.id}
                      wf={wf}
                      onUpdate={updateWorkflow}
                      onRemove={removeWorkflow}
                      canRemove={workflows.length > 1}
                      mode={interactiveType}
                    />
                  ))}
                </div>

                {/* Add action */}
                {workflows.length < maxWorkflows && availableToAdd.length > 0 && (
                  <div className="mt-3">
                    <select
                      onChange={(e) => { if (e.target.value) { addWorkflow(e.target.value); e.target.value = ""; } }}
                      defaultValue=""
                      className="w-full px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm bg-white text-gray-500 outline-none hover:border-emerald-400 cursor-pointer transition-colors"
                    >
                      <option value="">+ Add an action ({workflows.length}/{maxWorkflows} used)</option>
                      {availableToAdd.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}

                {workflows.length >= maxWorkflows && (
                  <p className="mt-3 text-center text-[11px] text-gray-400">
                    {interactiveType === "Button"
                      ? "Maximum 3 buttons reached. Switch to List mode to add a 4th option."
                      : "Maximum 4 options reached."}
                  </p>
                )}
              </div>
            )}

            {/* Response Messages card */}
            {welcomeMessageType === "Interactive" && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-bold text-gray-800 mb-1">Response Messages</h2>
                <p className="text-[11px] text-gray-400 mb-4">
                  These messages are sent when a customer taps each button
                </p>
                <div className="space-y-3">
                  {workflows
                    .filter((w) => w.workflow !== "Visit Website")
                    .map((w) => {
                      const Icon = WORKFLOW_ICONS[w.workflow] || Globe;
                      const colorClass = WORKFLOW_COLORS[w.workflow] || "";
                      const msg = getWorkflowMessage(w.workflow);
                      return (
                        <div key={w.workflow} className="rounded-xl border border-gray-100 p-3">
                          <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold px-2 py-0.5 rounded-full w-fit border ${colorClass}`}>
                            <Icon className="w-3 h-3" />
                            {w.workflow}
                          </div>
                          <textarea
                            value={msg}
                            onChange={(e) => updateWorkflowMessage(w.workflow, e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs bg-gray-50 resize-none outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                          <p className="text-[10px] text-gray-400 mt-0.5">{msg.length} characters</p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Save button (desktop) */}
            <div className="hidden sm:block">
              <button
                onClick={saveConfig}
                disabled={saving || hasErrors}
                className={`w-full py-3 rounded-2xl text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-all ${
                  hasErrors
                    ? "bg-gray-300 cursor-not-allowed"
                    : saving
                    ? "bg-emerald-400 cursor-wait"
                    : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]"
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
                    {hasErrors ? "Fix errors above to save" : "Save Configuration"}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT: Preview */}
          <div className="lg:sticky lg:top-5 lg:self-start">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="text-center mb-4">
                <h3 className="text-sm font-bold text-gray-800">Live Preview</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {interactiveType === "Button" ? "Button layout" : "List layout"}
                </p>
              </div>
              <PhonePreview
                headerText={headerText}
                messageBody={messageBody}
                workflows={workflows}
                interactiveType={interactiveType}
                welcomeMessageType={welcomeMessageType}
              />

              {/* Mode summary */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                  <span>Mode</span>
                  <span className="font-semibold text-gray-700">
                    {welcomeMessageType === "Interactive" ? `${interactiveType} (${workflows.length} actions)` : "Simple Text"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                  <span>Trigger words</span>
                  <span className="font-semibold text-gray-700">
                    {triggerWordsInput.split(",").filter(Boolean).length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                  <span>Bot status</span>
                  <span className={`font-semibold ${isBotActive ? "text-emerald-600" : "text-gray-400"}`}>
                    {isBotActive ? "● Active" : "○ Inactive"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile save button */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-lg z-40">
        <button
          onClick={saveConfig}
          disabled={saving || hasErrors}
          className={`w-full py-3 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
            hasErrors
              ? "bg-gray-300 cursor-not-allowed"
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
              {hasErrors ? "Fix errors to save" : "Save Configuration"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
