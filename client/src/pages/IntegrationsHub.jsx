import React from "react";
import { ArrowRight } from "lucide-react";
import WooCommerceLogo from "../images/woocommerce.png";
import ShopifyLogo from "../images/shopify.png";
import CalendarLogo from "../images/calanter.png";
import SheetsLogo from "../images/google sheet.png";
import RazorpayLogo from "../images/Razerpaylogo.png";


// Using CDN links to prevent Vite "File Not Found" 500 errors
const WhatsAppLogo = "https://cdn-icons-png.flaticon.com/512/733/733585.png";
// const ShopifyLogo = "https://cdn-icons-png.flaticon.com/512/5968/5968534.png";
// const WooCommerceLogo = "../images/woocommerce.png";
const BotLogo = "https://cdn-icons-png.flaticon.com/512/4712/4712035.png";
const AlertLogo = "https://cdn-icons-png.flaticon.com/512/2645/2645890.png";
// const CalendarLogo = "https://cdn-icons-png.flaticon.com/512/2370/2370264.png";
// const SheetsLogo = "https://cdn-icons-png.flaticon.com/512/281/281762.png";
// const RazorpayLogo = "https://cdn-icons-png.flaticon.com/512/10061/10061921.png";

const IntegrationsHub = ({ onNavigate }) => {
    const integrations = [
        {
            id: "whatsapp",
            name: "WhatsApp",
            description: "Connect Business API",
            status: "ACTIVE",
            icon: <img src={WhatsAppLogo} alt="WhatsApp" className="w-8 h-8 object-contain" />,
            actionText: "Configure",
            type: "button",
            route: "whatsapp"
        },
        {
            id: "shopify",
            name: "Shopify",
            description: "Order automation",
            status: "NOT LINKED",
            icon: <img src={ShopifyLogo} alt="Shopify" className="w-8 h-8 object-contain" />,
            actionText: "Setup Now",
            type: "arrow",
            route: "store"
        },

        {
            id: "woocommerce",
            name: "WooCommerce",
            description: "Store sync",
            status: "NOT LINKED",
            icon: <img src={WooCommerceLogo} alt="WooCommerce" className="w-11 h-11 object-contain" />,
            actionText: "Setup Now",
            type: "button",
            route: "store"
        },
        {
            id: "ai",
            name: "Custom AI Assistant",
            description: "Knowledge Base (RAG)",
            status: "NOT LINKED",
            icon: <img src={BotLogo} alt="AI Assistant" className="w-8 h-8 object-contain" />,
            actionText: "Setup Now",
            type: "button",
            route: "bot"
        },
        {
            id: "calendar",
            name: "Google Calendar",
            description: "Sync appointments",
            status: "ACTIVE",
            icon: <img src={CalendarLogo} alt="Calendar" className="w-10 h-10 object-contain" />,
            actionText: "Configure",
            type: "button",
            route: "google-calendar"
        },
        {
            id: "sheets",
            name: "Google Sheets",
            description: "Tracking sync",
            status: "ACTIVE",
            icon: <img src={SheetsLogo} alt="Sheets" className="w-8 h-8 object-contain" />,
            actionText: "Configure",
            type: "button",
            route: "google-sheets-tracking"
        },
        {
            id: "razorpay",
            name: "Razorpay",
            description: "Payment Gateway",
            status: "NOT LINKED",
            icon: <img src={RazorpayLogo} alt="Razorpay" className="w-11 h-11 object-contain" />,
            actionText: "Setup Now",
            type: "button",
            route: "razorpay"
        },
        {
            id: "daily-sales-alert",
            name: "Daily Sales Alert",
            description: "Automated daily report",
            status: "NOT LINKED",
            icon: <img src={AlertLogo} alt="Daily Sales Alert" className="w-8 h-8 object-contain" />,
            actionText: "Setup Now",
            type: "button",
            route: "daily-sales-alert"
        },
    ];

    return (
        <div className="p-4 lg:p-10 min-h-screen bg-[#f8f9fb]">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header Options */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h1 className="text-[34px] font-[900] text-[#1e293b] tracking-tight mb-2">Integrations Hub</h1>
                        <p className="text-[15px] font-[600] text-gray-500">Manage your business ecosystem connections</p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                        <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center"><img src={WhatsAppLogo} className="w-3.5 h-3.5 object-contain" alt="WhatsApp" /></div>
                        <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center"><img src={ShopifyLogo} className="w-3.5 h-3.5 object-contain" alt="Shopify" /></div>
                        <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center"><img src={WooCommerceLogo} className="w-3.5 h-3.5 object-contain" alt="Woo" /></div>
                        <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center"><img src={CalendarLogo} className="w-3.5 h-3.5 object-contain" alt="Calendar" /></div>
                        <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center"><img src={RazorpayLogo} className="w-3.5 h-3.5 object-contain" alt="Razorpay" /></div>
                        <div className="px-2 py-0.5 whitespace-nowrap text-[11px] font-[800] tracking-widest text-[#0ea960] bg-green-50 rounded-full">+4</div>
                    </div>
                </div>

                {/* Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {integrations.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => onNavigate && item.route ? onNavigate(item.route) : null}
                            className="group relative bg-white rounded-[32px] p-8 border border-gray-100 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_15px_40px_-10px_rgba(0,0,0,0.1)] hover:border-blue-100 cursor-pointer flex flex-col min-h-[220px] overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                            <div className="relative z-10 flex items-start justify-between mb-8">
                                <div className="w-14 h-14 rounded-[20px] bg-[#f8f9fc] border border-gray-50 flex items-center justify-center shadow-inner group-hover:scale-110 group-hover:shadow-[0_4px_15px_rgba(0,0,0,0.05)] transition-all duration-300">
                                    {item.icon}
                                </div>
                                <div className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 ${item.status === 'ACTIVE' ? 'bg-[#e2f9ea]' : 'bg-[#f1f5f9]'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'ACTIVE' ? 'bg-[#0ea960]' : 'bg-gray-400'}`}></div>
                                    <span className={`text-[10px] font-[800] tracking-wider ${item.status === 'ACTIVE' ? 'text-[#0ea960]' : 'text-gray-500'}`}>
                                        {item.status}
                                    </span>
                                </div>
                            </div>

                            <div className="relative z-10 flex-1">
                                <h3 className="text-[20px] font-[900] text-gray-900 tracking-tight leading-none mb-2.5 group-hover:text-[#0ea960] transition-colors">{item.name}</h3>
                                <p className="text-[13px] font-[600] text-gray-500">{item.description}</p>
                            </div>

                            {item.actionText && (
                                <div className="relative z-10 mt-6 flex items-end justify-between">
                                    <div>
                                        <span className="block text-[9px] font-[800] text-gray-400 tracking-widest uppercase mb-1">Connect</span>
                                        <span className="text-[13px] font-[800] text-gray-900">{item.actionText}</span>
                                    </div>
                                    <div className="w-10 h-10 rounded-[14px] bg-[#0ea960] flex items-center justify-center shadow-lg shadow-green-500/30 transform translate-x-8 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 ease-out">
                                        <ArrowRight className="w-5 h-5 text-white" />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
};

export default IntegrationsHub;

