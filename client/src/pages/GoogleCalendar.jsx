import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import axios from "../utils/axios";
import { Calendar, Trash2, CalendarPlus, Loader2, Play, Save, Clock, RefreshCw, Tag } from "lucide-react";
import { format, parseISO } from "date-fns";
const CalendarLogo = "https://cdn-icons-png.flaticon.com/512/2370/2370264.png";

const generateISOFromDateTime = (dateStr, hourStr, minStr, ampmStr) => {
   if (!dateStr || !hourStr || !minStr || !ampmStr) return null;
   const [year, month, day] = dateStr.split('-');
   let h = parseInt(hourStr, 10);
   if (ampmStr === 'PM' && h < 12) h += 12;
   if (ampmStr === 'AM' && h === 12) h = 0;

   const d = new Date(year, month - 1, day, h, parseInt(minStr, 10), 0);
   return d.toISOString();
};

const GoogleCalendar = ({ embedded = false }) => {
   const [isConnected, setIsConnected] = useState(false);
   const [loadingStatus, setLoadingStatus] = useState(true);
   const [email, setEmail] = useState('');
   const [upcomingEvents, setUpcomingEvents] = useState([]);
   const [loadingEvents, setLoadingEvents] = useState(false);

   const { register, handleSubmit, watch, formState: { errors, isSubmitting }, reset } = useForm();

   const currentTitle = watch("summary", "");

   useEffect(() => {
      checkStatus();

      const urlParams = new URLSearchParams(window.location.search);
      const connected = urlParams.get('calendarConnected');
      if (connected === 'true') {
         toast.success('Google Calendar Connected Successfully!');
         setIsConnected(true);
         window.history.replaceState({}, document.title, window.location.pathname);
      } else if (connected === 'false') {
         toast.error('Failed to connect Google Calendar.');
      }
   }, []);

   useEffect(() => {
      if (isConnected) {
         fetchEvents();
      }
   }, [isConnected]);

   const checkStatus = async () => {
      try {
         setLoadingStatus(true);
         const { data } = await axios.get('/api/calendar/status');
         setIsConnected(!!data.isConnected);
         if (data.email) setEmail(data.email);
      } catch (err) {
         console.error(err);
         toast.error('Could not verify calendar status');
      } finally {
         setLoadingStatus(false);
      }
   };

   const fetchEvents = async () => {
      try {
         setLoadingEvents(true);
         const { data } = await axios.get('/api/calendar/events');
         setUpcomingEvents(data.events || []);
      } catch (err) {
         toast.error('Failed to fetch upcoming events');
      } finally {
         setLoadingEvents(false);
      }
   };

   const handleConnect = async () => {
      try {
         const { data } = await axios.get('/api/calendar/auth-url');
         if (data.url) {
            window.location.href = data.url;
         }
      } catch (err) {
         toast.error('Failed to obtain Google OAuth URL');
      }
   };

   const handleDisconnect = async () => {
      try {
         await axios.post('/api/calendar/disconnect');
         setIsConnected(false);
         setEmail('');
         setUpcomingEvents([]);
         toast.success('Calendar disconnected');
      } catch (err) {
         toast.error('Failed to disconnect calendar');
      }
   };

   const onSubmit = async (data) => {
      try {
         const { summary, description, date, hour, minute, ampm } = data;

         const startDateTimeString = generateISOFromDateTime(date, hour, minute, ampm);
         if (!startDateTimeString) {
            return toast.error("Please fill out complete date and time.");
         }

         const endD = new Date(startDateTimeString);
         endD.setHours(endD.getHours() + 1);
         const endDateTimeString = endD.toISOString();

         await axios.post('/api/calendar/create-event', {
            summary,
            description,
            startDateTime: startDateTimeString,
            endDateTime: endDateTimeString
         });

         toast.success('Event successfully created!');
         reset();
         fetchEvents(); // Refresh events list
      } catch (err) {
         toast.error(err.response?.data?.error || 'Failed to create event');
      }
   };

   return (
      <div className="p-4 lg:p-8 min-h-screen">
         <div className="max-w-7xl mx-auto space-y-8">

            {/* Top Header Information (Optional keeping for consistency but un-intrusive) */}
            {!isConnected && !loadingStatus && (
               <div className="bg-white rounded-[24px] border border-gray-100 p-8 text-center shadow-sm">
                  <Calendar className="w-16 h-16 text-blue-500 mx-auto mb-6" />
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Google Calendar Integration</h2>
                  <p className="text-gray-500 mb-8 max-w-md mx-auto">Connect your calendar to sync appointments and manage test events directly through this sandbox console.</p>
                  <button
                     onClick={handleConnect}
                     className="px-8 py-3.5 bg-[#0ea960] text-white font-bold rounded-xl shadow-lg shadow-green-500/20 hover:bg-[#0c9554] transition"
                  >
                     Connect Calendar
                  </button>
               </div>
            )}

            {loadingStatus && (
               <div className="flex justify-center p-20">
                  <Loader2 className="w-10 h-10 animate-spin text-[#0ea960]" />
               </div>
            )}

            {isConnected && !loadingStatus && (
               <>
                  {/* Main Page Header */}
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b-2 border-transparent">
                     <div>
                        <h1 className="text-[32px] font-[900] text-gray-900 tracking-tight mb-2">Google Calendar</h1>
                        <p className="text-[15px] font-[500] text-gray-500 max-w-lg leading-relaxed">
                           Test your integration, push sandbox events, and monitor upcoming appointments synced directly from your connected Google account.
                        </p>
                     </div>

                     <div className="flex flex-col sm:flex-row items-center gap-4 bg-white px-5 py-4 rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 shrink-0">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center p-1.5">
                              <img src={CalendarLogo} alt="Google Calendar" className="w-full h-full object-contain" />
                           </div>
                           <div className="mr-2">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                 <div className="w-2 h-2 rounded-full bg-[#14a84d] animate-pulse"></div>
                                 <span className="text-[10px] font-[800] text-[#14a84d] uppercase tracking-widest leading-none">Connected Sync</span>
                              </div>
                              <p className="text-[14px] font-[800] text-gray-800 leading-none">{email || 'Fetching email...'}</p>
                           </div>
                        </div>
                        <div className="hidden sm:block w-px h-10 bg-gray-100"></div>
                        <button
                           onClick={handleDisconnect}
                           className="w-full sm:w-auto px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-[12px] font-[700] text-[13px] flex items-center justify-center gap-2 transition"
                        >
                           <Trash2 className="w-4 h-4" /> Disconnect
                        </button>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                     {/* Left Sandbox Panel */}
                     <div className="lg:col-span-8 bg-white rounded-[32px] border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">

                        {/* Sandbox Header */}
                        <div className="px-8 py-8 flex items-center gap-5 border-b border-gray-50">
                           <div className="w-[60px] h-[60px] rounded-[18px] bg-[#e2f9ea] flex items-center justify-center shrink-0 shadow-inner">
                              <Play className="w-7 h-7 text-[#0ea960] ml-1 fill-[#0ea960]" />
                           </div>
                           <div>
                              <h2 className="text-[22px] font-[800] text-gray-900 tracking-tight leading-tight mb-1">Sandbox Tool</h2>
                              <p className="text-[14px] text-gray-500 font-medium">Push test events to your calendar</p>
                           </div>
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleSubmit(onSubmit)} className="p-8">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8 mb-10">

                              {/* Event Title */}
                              <div>
                                 <label className="block text-[11px] font-[800] text-[#9ca3af] uppercase tracking-wider mb-2.5">
                                    Event Title
                                 </label>
                                 <div className="relative">
                                    <input
                                       {...register("summary", { required: true })}
                                       placeholder="e.g. Sales Meeting"
                                       className="w-full h-[56px] pl-5 pr-12 rounded-[16px] bg-[#f8f9fc] border-2 border-transparent focus:border-[#0ea960] focus:bg-white text-[15px] font-[700] text-gray-800 placeholder-gray-400 outline-none transition"
                                    />
                                    <Tag className="w-5 h-5 text-gray-300 absolute right-4 top-1/2 -translate-y-1/2" />
                                 </div>
                              </div>

                              {/* Description */}
                              <div>
                                 <label className="block text-[11px] font-[800] text-[#9ca3af] uppercase tracking-wider mb-2.5">
                                    Description
                                 </label>
                                 <input
                                    {...register("description")}
                                    placeholder="Add task details"
                                    className="w-full h-[56px] px-5 rounded-[16px] bg-[#f8f9fc] border-2 border-transparent focus:border-[#0ea960] focus:bg-white text-[15px] font-[700] text-gray-800 placeholder-gray-400 outline-none transition"
                                 />
                              </div>

                              {/* Date */}
                              <div>
                                 <label className="block text-[11px] font-[800] text-[#9ca3af] uppercase tracking-wider mb-2.5">
                                    Date
                                 </label>
                                 <div className="relative">
                                    <input
                                       type="date"
                                       {...register("date", { required: true })}
                                       className="w-full h-[56px] px-5 rounded-[16px] bg-[#f8f9fc] border-2 border-transparent focus:border-[#0ea960] focus:bg-white text-[15px] font-[700] text-gray-800 outline-none transition appearance-none"
                                    />
                                    <Calendar className="w-5 h-5 text-gray-800 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                                 </div>
                              </div>

                              {/* Time Group */}
                              <div>
                                 <label className="block text-[11px] font-[800] text-[#9ca3af] uppercase tracking-wider mb-2.5">
                                    Time
                                 </label>
                                 <div className="flex items-center w-full h-[56px] rounded-[16px] bg-[#f8f9fc] border-2 border-transparent focus-within:border-[#0ea960] focus-within:bg-white px-2 transition">
                                    <select
                                       {...register("hour", { required: true })}
                                       className="flex-1 h-full bg-transparent outline-none text-[16px] font-[800] text-center text-gray-900 cursor-pointer appearance-none"
                                    >
                                       {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                          <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                                       ))}
                                    </select>
                                    <span className="font-bold text-gray-400 text-lg mx-1 pb-1">:</span>
                                    <select
                                       {...register("minute", { required: true })}
                                       className="flex-1 h-full bg-transparent outline-none text-[16px] font-[800] text-center text-gray-900 cursor-pointer appearance-none"
                                    >
                                       {["00", "15", "30", "45"].map(m => (
                                          <option key={m} value={m}>{m}</option>
                                       ))}
                                    </select>
                                    <div className="relative flex-1 h-[40px] ml-2">
                                       <select
                                          {...register("ampm", { required: true })}
                                          className="w-full h-full bg-white rounded-[10px] outline-none text-[14px] font-[800] text-blue-600 text-center cursor-pointer shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
                                       >
                                          <option value="AM">AM</option>
                                          <option value="PM">PM</option>
                                       </select>
                                    </div>
                                 </div>
                              </div>

                           </div>

                           {/* Footer Actions */}
                           <div className="flex items-center justify-between border-t border-gray-100 pt-6">
                              <div className="text-[13px] font-[600] text-gray-400">
                                 Selected: <span className="text-gray-900 font-[800]">{currentTitle || 'No Title'}</span>
                              </div>
                              <button
                                 type="submit"
                                 disabled={isSubmitting}
                                 className="h-[52px] px-8 bg-[#14a84d] text-white rounded-[14px] font-[800] text-[15px] flex items-center justify-center gap-2.5 hover:bg-[#119443] shadow-[0_6px_16px_rgba(20,168,77,0.25)] hover:shadow-[0_8px_20px_rgba(20,168,77,0.3)] transition-all disabled:opacity-50 active:scale-95"
                              >
                                 {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                 ) : (
                                    <Save className="w-5 h-5" />
                                 )}
                                 Sync Event
                              </button>
                           </div>
                        </form>
                     </div>

                     {/* Right Upcoming Events Panel */}
                     <div className="lg:col-span-4 bg-white rounded-[32px] border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col h-[600px]">

                        {/* Panel Header */}
                        <div className="px-6 py-6 flex items-center justify-between border-b border-gray-50">
                           <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                                 <Clock className="w-4 h-4 text-blue-600" />
                              </div>
                              <h3 className="text-[13px] font-[800] tracking-widest text-[#1e293b]">UPCOMING EVENTS</h3>
                           </div>
                           <button onClick={fetchEvents} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition" title="Refresh">
                              <RefreshCw className={`w-4 h-4 ${loadingEvents ? 'animate-spin' : ''}`} />
                           </button>
                        </div>

                        {/* Events List */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
                           {loadingEvents ? (
                              <div className="flex justify-center py-10">
                                 <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                              </div>
                           ) : upcomingEvents.length === 0 ? (
                              <div className="text-center py-10 text-gray-400 font-medium text-sm">
                                 No upcoming events.
                              </div>
                           ) : (
                              upcomingEvents.map((event) => {
                                 const startDate = new Date(event.start?.dateTime || event.start?.date);
                                 return (
                                    <div key={event.id} className="bg-[#f8f9fc] rounded-[16px] p-4 flex gap-4 items-center">
                                       {/* Date Box */}
                                       <div className="w-[50px] bg-white rounded-[12px] flex flex-col items-center justify-center py-2 shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-gray-100/50 shrink-0">
                                          <span className="text-[10px] font-[800] text-blue-500 uppercase">{format(startDate, 'MMM')}</span>
                                          <span className="text-[20px] font-[900] text-gray-900 leading-none mt-0.5">{format(startDate, 'd')}</span>
                                       </div>

                                       {/* Details */}
                                       <div className="flex-1 min-w-0">
                                          <h4 className="text-[15px] font-[800] text-gray-900 truncate mb-1">{event.summary || 'No Title'}</h4>
                                          <div className="flex items-center gap-1.5 text-gray-500">
                                             <Clock className="w-3.5 h-3.5" />
                                             <span className="text-[12px] font-[600]">{format(startDate, 'h:mm a')}</span>
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })
                           )}
                        </div>

                     </div>
                  </div>
               </>
            )}

         </div>

         <style jsx>{`
         .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
         }
         .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
         }
         .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #e2e8f0;
            border-radius: 10px;
         }
         input[type="date"]::-webkit-calendar-picker-indicator {
            background: transparent;
            bottom: 0;
            color: transparent;
            cursor: pointer;
            height: auto;
            left: 0;
            position: absolute;
            right: 0;
            top: 0;
            width: auto;
         }
      `}</style>
      </div>
   );
};

export default GoogleCalendar;
