import React, { useState, useContext, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// LOGOS
import GoWhatslogo from "../images/gowhats-icon-bot1.png";
import Golo from '../images/golo1.png';

// MENU ICON IMAGES
import OverviewIcon from "../images/dash2.png";
import SettingsIcon from "../images/setting1.png";
import OrdersIcon from "../images/oreder.png";
import BroadcastIcon from "../images/boradcast2.png";
import TemplatesIcon from "../images/template12.png";
import FulfillmentIcon from "../images/autoo.png";
import ChatsIcon from "../images/chat.png";
import LogoutIcon from "../images/logout.png";
import InventoryIcon from '../images/inventory.png';
import EventIcon from "../images/conference_301132.png";

const Sidebar = () => {
  const location = useLocation();
  const [activeItem, setActiveItem] = useState('overview');
  const [isMobileFooterVisible, setIsMobileFooterVisible] = useState(true);
  const { logout } = useContext(AuthContext); // ✅ Get logout from AuthContext
  const lastWindowScrollYRef = useRef(0);
  const lastScrollByTargetRef = useRef(new WeakMap());

  const isActive = (path) => location.pathname === path;

  useEffect(() => {
    const isMobile = () => window.innerWidth < 768;

    const handleScroll = (event) => {
      if (!isMobile()) return;

      const target = event?.target;
      let currentTop = 0;
      let targetElement = null;

      if (target instanceof HTMLElement) {
        currentTop = target.scrollTop;
        targetElement = target;
      } else {
        currentTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      }

      if (targetElement) {
        const previousTop = lastScrollByTargetRef.current.get(targetElement);

        if (previousTop === undefined) {
          lastScrollByTargetRef.current.set(targetElement, currentTop);
          return;
        }

        const delta = currentTop - previousTop;
        if (Math.abs(delta) < 6) return;

        if (delta > 0 && currentTop > 24) {
          setIsMobileFooterVisible(false);
        } else if (delta < 0) {
          setIsMobileFooterVisible(true);
        }

        lastScrollByTargetRef.current.set(targetElement, currentTop);
        return;
      }

      const previousWindowTop = lastWindowScrollYRef.current;
      const delta = currentTop - previousWindowTop;
      if (Math.abs(delta) < 6) return;

      if (delta > 0 && currentTop > 24) {
        setIsMobileFooterVisible(false);
      } else if (delta < 0) {
        setIsMobileFooterVisible(true);
      }

      lastWindowScrollYRef.current = currentTop;
    };

    const handleResize = () => {
      if (!isMobile()) {
        setIsMobileFooterVisible(true);
      }
    };

    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    setIsMobileFooterVisible(true);
  }, [location.pathname]);


  // ===== MOBILE TOP MENU ITEMS =====
  const mobileTopMenuItems = [
      { icon: OverviewIcon, id: 'overview', path: '/admin', label: 'Overview' },
      { icon: EventIcon, id: 'events', path: '/admin/events', label: 'Event' },
     { icon: SettingsIcon, id: 'settings', path: '/admin/settings', label: 'Settings' }    
  ];

  const mobileBottomMenuItems = [
    { icon: BroadcastIcon, id: 'BroadcastMessage', path: '/admin/BroadcastMessage', label: 'Broadcast' },
    { icon: TemplatesIcon, id: 'templates', path: '/admin/templates', label: 'Templates' },
    { icon: FulfillmentIcon, id: 'fulfillment-flow', path: '/admin/fulfillment-flow', label: 'Fulfillment' },
    { icon: ChatsIcon, id: 'chats', path: '/admin/chats', label: 'Chats' },
  ];

  // ===== DESKTOP MENU ITEMS =====
  const desktopMenuItems = [
    { icon: OverviewIcon, id: 'overview', path: '/admin', label: 'Overview' },
    { icon: ChatsIcon, id: 'chats', path: '/admin/chats', label: 'Chats' },
    { icon: BroadcastIcon, id: 'BroadcastMessage', path: '/admin/BroadcastMessage', label: 'Broadcast' },
    { icon: TemplatesIcon, id: 'templates', path: '/admin/templates', label: 'Templates' },
    { icon: FulfillmentIcon, id: 'fulfillment-flow', path: '/admin/fulfillment-flow', label: 'Fulfillment' },
    { icon: SettingsIcon, id: 'settings', path: '/admin/settings', label: 'Settings' },
  ];

    return (
    <>
      {/* ===== MOBILE TOP HEADER ===== */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-30 shadow-sm h-16">
        <div className="flex items-center justify-between px-4 py-3 h-full">

          {/* Logo */}
          <div className="flex items-center gap-1">
            <div className="relative">
              <img
                src={GoWhatslogo}
                alt="GoWhats Logo"
                className="w-8 h-8"
              />
            </div>
            <span className="font-semibold text-gray-900 text-xl">oWhats</span>
          </div>


	{/* Mobile Top Menu Items */}
          <div className="flex items-center space-x-1.5">
            {mobileTopMenuItems.map((item) => (
              <Link
                to={item.path}
                key={item.id}
                onClick={() => setActiveItem(item.id)}
              >
                <div
                  className={`p-2 rounded-lg transition-all duration-200
                    ${isActive(item.path)
                      ? 'bg-green-500 text-white'
                      : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <img src={item.icon} alt={item.label} className="w-5 h-5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ===== MOBILE BOTTOM NAVIGATION ===== */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 z-30 h-20 px-3 py-2 pointer-events-none transition-all duration-300 ease-out ${
        isMobileFooterVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}>
        <div className="pointer-events-auto h-full bg-white border border-gray-200 rounded-[30px] shadow-[0_4px_16px_rgba(0,0,0,0.14)] overflow-hidden">
          <div className="grid grid-cols-4 h-full">
            {mobileBottomMenuItems.map((item, index) => (
              <Link
                to={item.path}
                key={item.id}
                onClick={() => setActiveItem(item.id)}
                className="h-full"
              >
                <div
                  className={`flex flex-col items-center justify-center h-full transition-all duration-200
                    ${isActive(item.path)
                      ? 'bg-sky-100 text-sky-700'
                      : 'text-gray-700 hover:bg-gray-100'}
                    ${index === 0 ? 'rounded-l-[30px]' : ''}
                    ${index === mobileBottomMenuItems.length - 1 ? 'rounded-r-[30px]' : ''}`}
                >
                  <img src={item.icon} alt={item.label} className="w-5 h-5" />
                  <span className="text-[10px] mt-1 font-semibold">{item.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ===== DESKTOP SIDEBAR ===== */}
      <div className="hidden md:flex fixed top-0 left-0 h-full bg-white w-16 shadow-sm flex-col z-50">

        {/* Logo Container */}
        <div className="h-[80px] flex-shrink-0 flex items-end justify-center pb-2">
          <img
            src={Golo}
            alt="GoWhats Logo"
            className="w-14 h-14 object-contain"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col justify-between p-2">
          <div className="flex flex-col gap-10 mt-10">
            {desktopMenuItems.map((item) => (
              <Link
                to={item.path}
                key={item.id}
                onClick={() => setActiveItem(item.id)}
                title={item.label}
              >
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-xl border-2 transition-all duration-200
                    ${isActive(item.path)
                      ? 'bg-green-500 border-green-500 shadow-md'
                      : 'border-green-400 bg-white hover:bg-green-50'}`}
                >
                  <img
                    src={item.icon}
                    alt={item.label}
                    className={`w-6 h-6 transition-all
                      ${isActive(item.path) ? 'brightness-0 invert' : ''}`}
                  />
                </div>
              </Link>
            ))}
          </div>

          {/* ✅ FIXED Logout Button - now calls logout() from AuthContext */}
          <div className="pt-2 border-t border-gray-200 mb-4">
            <button
              onClick={logout}
              title="Logout"
              className="w-full flex items-center justify-center p-3 rounded-lg bg-red-50 text-red-500 hover:bg-red-300 transition-colors duration-200 cursor-pointer"
              style={{ border: '2px solid #ef4444' }}
            >
              <img src={LogoutIcon} alt="Logout" className="w-6 h-6" />
            </button>
          </div>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
