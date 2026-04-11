import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ClipboardList, Camera, MessageSquare } from "lucide-react";
import RegistrationList from "../components/RegistrationList";
import TicketScanner from "./TicketScanner";
import FlowQuestionsPage from "./FlowQuestionsPage";

const MOBILE_BREAKPOINT = 768;

const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

const EVENT_PAGE_TABS = [
  {
    id: "registrations",
    title: "Registrations",
    icon: ClipboardList,
    render: () => <RegistrationList />,
    contentClassName: "p-0",
  },
  {
    id: "scanner",
    title: "Scanner",
    icon: Camera,
    render: () => <TicketScanner embedded />,
    contentClassName: "p-0",
  },
  {
    id: "flow-questions",
    title: "Questions",
    icon: MessageSquare,
    render: () => <FlowQuestionsPage />,
    contentClassName: "p-0",
  },
];

const EventPage = () => {
  const [isMobile, setIsMobile] = useState(() => isMobileViewport());
  const [activeSection, setActiveSection] = useState("registrations");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleResize = useCallback(() => {
    setIsMobile(isMobileViewport());
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const handleSectionChange = (sectionId) => {
    if (sectionId === activeSection) return;

    setIsTransitioning(true);
    setTimeout(() => {
      setActiveSection(sectionId);
      setIsTransitioning(false);
    }, 120);
  };

  if (!isMobile) {
    return <Navigate to="/admin/fulfillment-flow" replace />;
  }

  const currentTab =
    EVENT_PAGE_TABS.find((tab) => tab.id === activeSection) ?? EVENT_PAGE_TABS[0];

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <div className="flex items-center gap-2 overflow-x-auto bg-gray-900 px-3 py-2 scrollbar-hide flex-shrink-0">
        {EVENT_PAGE_TABS.map((tab) => {
          const TabIcon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => handleSectionChange(tab.id)}
              className={`flex-shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors duration-200 flex items-center gap-1.5 ${
                activeSection === tab.id
                  ? "bg-green-500 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {tab.title}
            </button>
          );
        })}
      </div>

      <main className="flex-1 overflow-hidden rounded-t-2xl bg-[#f0fdf4]">
        <div
          className={`h-full overflow-y-auto transition-opacity duration-150 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className={currentTab.contentClassName ?? "p-3"}>
            {currentTab.render()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default EventPage;

