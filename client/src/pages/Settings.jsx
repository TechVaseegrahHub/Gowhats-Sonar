import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import TagsComponent from "../components/TagsComponent.jsx";
import QuickResponse from "../components/QuickResponse.jsx";
import WelcomeTemplates from "../components/WelcomeTemplates.jsx";
import ShippingSettings from "../components/ShippingManager.jsx";
import WhatsAppConnectPage from "../pages/WhatsAppConnect";
import BotToggle from "../components/BotToggle.jsx";
import StoreIntegration from "../pages/StoreIntegration.jsx";
import InventoryPage from "../pages/Inventory.jsx";
import RegistrationFormConfig from "../components/RegistrationFormConfig.jsx";
import Razorpay from "../pages/RazorpayIntegration.jsx";
import OrderAutomationConfig from "../components/OrderAutomationConfig.jsx";
import FlowStudio from "../components/FlowStudio.jsx";
import ApiKeys from '../components/Settings/ApiKeys';
import PushNotificationsSettings from '../components/Settings/PushNotifications.jsx';
import FileUpload from "./FileUpload.jsx";
import GoogleSheetsTracking from "./GoogleSheetsTracking.jsx";
import GoogleCalendar from "./GoogleCalendar.jsx";
import IntegrationsHub from "./IntegrationsHub.jsx";
import DeviceSecuritySettings from "../components/DeviceSecuritySettings.jsx"; // NEW IMPORT
import SettingsMenuIconImage from "../images/setting1.png";
import WhatsAppMenuIconImage from "../images/whatsapp_216583.png";
import FlowMenuIconImage from "../images/web_211588.png";
import AutomationMenuIconImage from "../images/oreder.png";
import RegistrationMenuIconImage from "../images/conference_301132.png";
import WebsiteMenuIconImage from "../images/store_267439.png";
import ShippingMenuIconImage from "../images/truck_211324.png";
import SheetSyncMenuIconImage from "../images/paste_364281.png";
import BotMenuIconImage from "../images/ai_211867.png";
import TagsMenuIconImage from "../images/price-tag_267411.png";
import PaymentsMenuIconImage from "../images/money_267432.png";
import QuickReplyMenuIconImage from "../images/reply_311202.png";
import ApiKeysMenuIconImage from "../images/key_301190.png";
import WelcomeMenuIconImage from "../images/message_211562.png";
import InventoryMenuIconImage from "../images/inventory.png";
import useSubscription from "../hooks/useSubscription";
import ProFeatureLockCard from "../components/ProFeatureLockCard.jsx";
import DailySalesAlertSettings from "../components/DailySalesAlertSettings.jsx";
import {
  Settings2,
  Tag,
  MessageCircle,
  ArrowLeft,
} from "lucide-react";

const MOBILE_SETTINGS_MENU_ITEMS = [
  { id: "whatsapp", section: "core-setup", label: "WhatsApp", image: WhatsAppMenuIconImage, description: "Connect & Setup" },
  { id: "integrations-hub", section: "core-setup", label: "Integrations Hub", image: SheetSyncMenuIconImage, description: "Apps & Connects" },
  { id: "insights", section: "core-setup", label: "Flow", image: FlowMenuIconImage, description: "Studio & Endpoint" },
  { id: "order-automation", section: "business-tools", label: "Automation", image: AutomationMenuIconImage, description: "Order Flow" },
  { id: "registration", section: "business-tools", label: "Registration", image: RegistrationMenuIconImage, description: "QR Setup" },
  { id: "store", section: "business-tools", label: "Website", image: WebsiteMenuIconImage, description: "Integration" },
  { id: "shipping", section: "operations", label: "Shipping", image: ShippingMenuIconImage, description: "Delivery" },
  { id: "google-sheets-tracking", section: "operations", label: "Sheet Sync", image: SheetSyncMenuIconImage, description: "Tracking Sync" },
  { id: "google-calendar", section: "operations", label: "G Calendar", image: SheetSyncMenuIconImage, description: "Appointments" },
  { id: "bot", section: "operations", label: "AI Bot", image: BotMenuIconImage, description: "Assistant" },
  { id: "tags", section: "support-tools", label: "Tags", image: TagsMenuIconImage, description: "Management" },
  { id: "razorpay", section: "support-tools", label: "Payments", image: PaymentsMenuIconImage, description: "Razorpay" },
  { id: "quick", section: "support-tools", label: "Quick Reply", image: QuickReplyMenuIconImage, description: "Responses" },
  { id: "api-keys", section: "admin-tools", label: "API Keys", image: ApiKeysMenuIconImage, description: "Integration" },
  { id: "device-security", section: "admin-tools", label: "Device Auth", image: ApiKeysMenuIconImage, description: "Session Security" }, // ADDED HERE
  { id: "welcome", section: "admin-tools", label: "Welcome", image: WelcomeMenuIconImage, description: "Messages" },
  { id: "inventory", section: "admin-tools", label: "Inventory", image: InventoryMenuIconImage, description: "Catalog" },
  {
    id: "push-notifications",
    section: "admin-tools",
    label: "Push Alerts",
    image: WelcomeMenuIconImage,
    description: "PWA Push",
  },
  { id: "daily-sales-alert", section: "admin-tools", label: "Sales Alert", image: BotMenuIconImage, description: "Daily Report" },
];

const MOBILE_SETTINGS_SECTIONS = [
  { id: "core-setup", title: "Core Setup" },
  { id: "business-tools", title: "Business Tools" },
  { id: "operations", title: "Operations" },
  { id: "support-tools", title: "Support Tools" },
  { id: "admin-tools", title: "Admin Tools" },
];

const MOBILE_SETTINGS_GROUPS = MOBILE_SETTINGS_SECTIONS.map((section) => ({
  ...section,
  items: MOBILE_SETTINGS_MENU_ITEMS.filter((item) => item.section === section.id),
}));

const DESKTOP_SETTINGS_MENU_ITEMS = [
  { id: "integrations-hub", label: "Integrations Hub", image: SheetSyncMenuIconImage, description: "Google, Shopify & Apps" },
  { id: "insights", label: "Flow Studio", image: FlowMenuIconImage, description: "Builder, endpoint & publish" },
  { id: "order-automation", label: "Order Automation", image: AutomationMenuIconImage, description: "WhatsApp flow" },
  { id: "registration", label: "Registration Form", image: RegistrationMenuIconImage, description: "QR code registration setup" },
  { id: "store", label: "Website Integration", image: WebsiteMenuIconImage, description: "Store Sync" },
  { id: "shipping", label: "Shipping Methods", image: ShippingMenuIconImage, description: "Delivery & shipping options" },
  { id: "tags", label: "Tags Management", image: TagsMenuIconImage, description: "Tagging" },
  { id: "quick", label: "Quick Responses", image: QuickReplyMenuIconImage, description: "Automated responses" },
  { id: "api-keys", label: "API Keys", image: ApiKeysMenuIconImage, description: "API Integration & Keys" },
  { id: "device-security", label: "Device Security", image: ApiKeysMenuIconImage, description: "Manage team device sessions & access codes" }, // ADDED HERE
  { id: "welcome", label: "Welcome Messages", image: WelcomeMenuIconImage, description: "Custom greeting templates" },
  {
    id: "push-notifications",
    label: "Push Notifications",
    image: WelcomeMenuIconImage,
    description: "PWA alerts & test"
  },
  { id: "daily-sales-alert", label: "Daily Sales Alert", image: BotMenuIconImage, description: "Automated daily report" },
];

// Desktop Menu Items Component
const SettingsMenuItems = ({ activeSection, onSelect }) => (
  <nav className="space-y-3">
    {DESKTOP_SETTINGS_MENU_ITEMS.map((item) => {
      const isActive = activeSection === item.id;

      return (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`
            w-full flex items-center text-left transition-all duration-200 transform px-4 py-4
            rounded-2xl group relative overflow-hidden
            ${isActive
              ? `bg-green-50 border-green-200 border-2 shadow-md scale-[0.98]`
              : `hover:bg-gray-50 border-2 border-transparent hover:shadow-sm hover:scale-[0.99]`
            }
          `}
        >
          <div className="flex items-center justify-center w-10 h-10 transition-all duration-200">
            <img
              src={item.image}
              alt={item.label}
              className="w-6 h-6 object-contain transition-transform duration-200 group-hover:scale-105"
            />
          </div>

          <div className="flex-1 min-w-0 ml-4">
            <div className={`text-sm font-bold tracking-tight ${isActive ? 'text-gray-900' : 'text-gray-700 group-hover:text-gray-900'}`}>
              {item.label}
            </div>
            <div className={`text-xs mt-1 font-medium ${isActive ? 'text-gray-600' : 'text-gray-500 group-hover:text-gray-600'}`}>
              {item.description}
            </div>
          </div>

          {isActive && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <div className="w-3 h-3 rounded-full bg-green-600 shadow-sm" />
            </div>
          )}
        </button>
      );
    })}
  </nav>
);

// Professional Mobile Settings Grid
const MobileSettingsGrid = ({ onSelect }) => (
  <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 pb-[env(safe-area-inset-bottom)]">
    <div className="mx-auto max-w-md space-y-4 px-3 pt-3 pb-8 sm:px-4">
      {MOBILE_SETTINGS_GROUPS.map((section) => (
        <section key={section.id} className="rounded-[28px] border border-gray-100 bg-white/80 p-3 shadow-sm backdrop-blur-sm">
          <div className="px-1 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400">{section.title}</p>
          </div>

          <div
            className="scrollbar-hide -mx-1 grid snap-x snap-mandatory grid-flow-col gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid-cols-3 sm:grid-flow-row sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0"
            style={{ gridAutoColumns: 'calc((100% - 1.5rem) / 3)' }}
          >
            {section.items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className="group relative flex min-h-[104px] w-full min-w-0 snap-start flex-col items-center justify-center overflow-hidden rounded-[22px] border border-gray-100 bg-white px-2 py-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="relative mb-3 flex h-12 w-12 items-center justify-center transition-all duration-300 group-hover:scale-105">
                  <img src={item.image} alt={item.label} className="h-10 w-10 object-contain" />
                </div>
                <span className="px-1 text-center text-[11px] font-semibold leading-tight text-gray-800 transition-colors group-hover:text-gray-900 sm:text-xs">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  </div>
);

// Professional Mobile Content View
const MobileContentView = ({ activeSection, onBack, renderContent }) => {
  const currentItem = MOBILE_SETTINGS_MENU_ITEMS.find(item => item.id === activeSection);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-[env(safe-area-inset-bottom)]">
      <div className="relative bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg">
        <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />

        <div className="relative px-4 py-4" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
          <div className="flex items-center">
            <button
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="ml-4 flex-1">
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">{currentItem?.label || "Settings"}</h1>
                <p className="text-xs text-white/80 font-medium">{currentItem?.description || "Configuration"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="h-4 bg-gradient-to-b from-gray-50 to-white rounded-t-[1rem] -mb-px" />
      </div>

      <div className="pb-20">
        {renderContent(activeSection)}
      </div>
    </div>
  );
};

const SideNavigation = ({ activeSection, onSelect }) => {
  return (
    <div className="hidden lg:flex w-80 bg-white/95 backdrop-blur-xl border-r border-gray-200/80 shadow-2xl lg:shadow-none flex-col">
      <div className="flex items-center p-6 border-b border-gray-100/80">
        <div className="flex items-center space-x-4">
          <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl shadow-lg">
            <img src={SettingsMenuIconImage} alt="Settings" className="w-4 h-4 object-contain brightness-0 invert" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Settings</h2>
            <p className="text-sm text-gray-600 font-medium">System Configuration</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-8 px-6">
        <SettingsMenuItems activeSection={activeSection} onSelect={onSelect} />
      </div>
    </div>
  );
};

const ApiKeysWrapper = () => (
  <div className="p-4 lg:p-10"><div className="max-w-7xl mx-auto"><ApiKeys /></div></div>
);

const PushNotificationsWrapper = () => (
  <div className="p-4 lg:p-10">
    <div className="max-w-7xl mx-auto">
      <PushNotificationsSettings />
    </div>
  </div>
);

const BotSettingsComponent = ({ embedded = false }) => {
  return (
    <div className="p-4 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Bot ON/OFF Toggle */}
        <BotToggle />

        {/* Knowledge Base Upload */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 lg:p-8">
          <FileUpload embedded={embedded} />
        </div>

      </div>
    </div>
  );
};

const WhatsAppConnectSection = ({ embedded = false }) => (
  <div className="flex items-center justify-center min-h-[80vh] lg:h-screen bg-gray-50 p-4">
    <div className="w-full max-w-lg"><WhatsAppConnectPage embedded={embedded} /></div>
  </div>
);

const InsightsComponent = ({ embedded = false }) => <FlowStudio embedded={embedded} />;

const ShippingComponent = ({ embedded = false }) => (
  <div className="p-2 lg:p-8">
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/60">
        <div className="p-4 lg:p-8"><ShippingSettings embedded={embedded} /></div>
      </div>
    </div>
  </div>
);

const TagsComponentWrapper = () => (
  <div className="p-4 lg:p-8">
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 overflow-hidden">
        <div className="hidden lg:flex bg-gradient-to-r from-lime-50 to-green-50 px-8 py-12 border-b border-gray-100">
          <div className="flex items-center space-x-6">
            <div className="w-16 h-16 bg-gradient-to-br from-lime-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Tag className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tags Management</h1>
              <p className="text-lg text-gray-600 mt-2 font-medium">Organize with custom tags</p>
            </div>
          </div>
        </div>
        <div className="p-4 lg:p-8"><TagsComponent /></div>
      </div>
    </div>
  </div>
);

const RazorpayComponent = () => (
  <div className="p-4 lg:p-10">
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 overflow-hidden p-4 lg:p-8">
        <Razorpay />
      </div>
    </div>
  </div>
);

const QuickResponseComponent = () => (
  <div className="p-4 lg:p-8">
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 overflow-hidden">
        <div className="hidden lg:flex bg-gradient-to-r from-teal-50 to-cyan-50 px-8 py-12 border-b border-gray-100">
          <div className="flex items-center space-x-6">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Quick Responses</h1>
              <p className="text-lg text-gray-600 mt-2 font-medium">Automated customer replies</p>
            </div>
          </div>
        </div>
        <div className="p-4 lg:p-8"><QuickResponse /></div>
      </div>
    </div>
  </div>
);

const WelcomeComponent = () => (
  <div className="p-4 lg:p-8">
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 overflow-hidden">
        <div className="p-4 lg:p-8"><WelcomeTemplates /></div>
      </div>
    </div>
  </div>
);

const InventoryComponent = () => <div className="p-2 lg:p-8"><InventoryPage /></div>;

const isMobileViewport = () => typeof window !== "undefined" && window.innerWidth < 1024;

const STORAGE_KEY = "settingsActiveSection";
const DEFAULT_SECTION = "integrations-hub";

const SettingsPage = () => {
  const location = useLocation();
  const { subscription } = useSubscription();
  const hasProAccess = subscription?.hasProAccess ?? subscription?.isPro ?? false;
  const trialExpired = subscription?.trial?.isExpired;
  const proExpired = subscription?.pro?.isExpired;

  const [isMobileView, setIsMobileView] = useState(() => isMobileViewport());

  const [activeSection, setActiveSection] = useState(() => {
    if (isMobileViewport()) return null;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SECTION;
  });

  const handleSectionSelect = (section) => {
    setActiveSection(section);
    localStorage.setItem(STORAGE_KEY, section);
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = isMobileViewport();
      setIsMobileView(mobile);

      if (!mobile) {
        setActiveSection((currentSection) => {
          const saved = localStorage.getItem(STORAGE_KEY);
          return currentSection || saved || DEFAULT_SECTION;
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedSection = params.get("section");

    if (!requestedSection) return;

    const isKnownSection = MOBILE_SETTINGS_MENU_ITEMS.some((item) => item.id === requestedSection);
    if (isKnownSection) handleSectionSelect(requestedSection);
  }, [location.search]);

  const renderContent = (section) => {
    switch (section) {
      case "integrations-hub": return <IntegrationsHub onNavigate={handleSectionSelect} embedded={isMobileView} />;
      case "whatsapp": return <WhatsAppConnectSection embedded={isMobileView} />;
      case "insights": return <InsightsComponent embedded={isMobileView} />;
      case "order-automation": return <OrderAutomationConfig embedded={isMobileView} />;
      case "registration": return <RegistrationFormConfig embedded={isMobileView} />;
      case "store": return <StoreIntegration embedded={isMobileView} />;
      case "shipping": return <ShippingComponent embedded={isMobileView} />;
      case "device-security": return <DeviceSecuritySettings />; // ADDED ROUTE HERE
      case "daily-sales-alert":
        return (
          <div className="p-4 lg:p-8">
            <div className="max-w-7xl mx-auto">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 overflow-hidden">
                <div className="p-4 lg:p-8"><DailySalesAlertSettings /></div>
              </div>
            </div>
          </div>
        );
      case "google-sheets-tracking":
        if (!hasProAccess) {
          return (
            <div className="p-4 lg:p-10">
              <ProFeatureLockCard
                featureName="Google Sheets Tracking"
                description={proExpired ? "Your Pro subscription has expired." : "Locked in Free Trial."}
              />
            </div>
          );
        }
        return <GoogleSheetsTracking embedded />;

      case "google-calendar": return <GoogleCalendar embedded={isMobileView} />;

      case "bot":
        if (!hasProAccess) {
          return (
            <div className="p-4 lg:p-10">
              <ProFeatureLockCard
                featureName="AI Assistant Configuration"
                description={proExpired ? "Your Pro subscription has expired." : "Locked in Free Trial."}
              />
            </div>
          );
        }
        return <BotSettingsComponent embedded={isMobileView} />;

      case "tags": return <TagsComponentWrapper />;

      case "api-keys":
        if (!hasProAccess) {
          return (
            <div className="p-4 lg:p-10">
              <ProFeatureLockCard
                featureName="API Keys"
                description={proExpired ? "Your Pro subscription has expired." : "Locked in Free Trial."}
              />
            </div>
          );
        }
        return <ApiKeysWrapper />;

      case "razorpay": return <RazorpayComponent />;
      case "quick": return <QuickResponseComponent />;
      case "welcome": return <WelcomeComponent />;
      case "push-notifications":
        return <PushNotificationsWrapper />;
      case "inventory": return <InventoryComponent />;

      default:
        return (
          <div className="p-8 flex items-center justify-center h-full min-h-[60vh]">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                <Settings2 className="w-10 h-10 text-gray-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Not Found</h3>
              <p className="text-gray-600 font-medium max-w-md mx-auto">Select a section from the menu</p>
            </div>
          </div>
        );
    }
  };

  if (isMobileView) {
    if (activeSection) {
      return (
        <MobileContentView
          activeSection={activeSection}
          onBack={() => setActiveSection(null)}
          renderContent={renderContent}
        />
      );
    }
    return <MobileSettingsGrid onSelect={handleSectionSelect} />;
  }

  const selectedSection = activeSection || localStorage.getItem(STORAGE_KEY) || DEFAULT_SECTION;

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100/50">
      <SideNavigation activeSection={selectedSection} onSelect={handleSectionSelect} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 to-gray-100/50">
          {renderContent(selectedSection)}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
