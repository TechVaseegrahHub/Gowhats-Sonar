import React, { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { CheckCircle, XCircle, RefreshCw, Camera, ArrowLeft, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TicketScanner = () => {
  const [scanResult, setScanResult] = useState(null);
  const [message, setMessage] = useState('');
  const [ticketDetails, setTicketDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [scanHistory, setScanHistory] = useState([]);
  const [cameraError, setCameraError] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // ✅ Track camera mode
  const navigate = useNavigate();

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleScan = async (result) => {
    if (loading || scanResult || hasScanned) return;

    const text = result?.[0]?.rawValue || result?.getText?.() || result;

    if (!text) return;

    // Only process if text looks like JSON
    if (!text.includes('{')) return;

    setHasScanned(true);

    try {
      setLoading(true);

      // Vibrate if on mobile
      if (navigator.vibrate) navigator.vibrate(200);

      // Parse QR data
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        setScanResult('error');
        setMessage('Invalid QR Code Format');
        setTimeout(() => {
          setHasScanned(false);
          setScanResult(null);
        }, 2000);
        return;
      }

      // Basic validation
      if (!parsed.tid || !parsed.t_id) {
        setScanResult('error');
        setMessage('Invalid Ticket Data');
        setTimeout(() => {
          setHasScanned(false);
          setScanResult(null);
        }, 2000);
        return;
      }

      const token = localStorage.getItem('token') || localStorage.getItem('authToken');

      if (!token) {
        setScanResult('error');
        setMessage('Authentication Required. Please Login.');
        setTimeout(() => {
          setHasScanned(false);
          setScanResult(null);
        }, 2000);
        return;
      }

      // ✅ Validate with backend
      const apiUrl = localStorage.getItem('apiBaseUrl') || 'https://bot.gowhats.in';
      const response = await fetch(`${apiUrl}/api/tickets/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ qrData: text })
      });

      const data = await response.json();

      if (data.success) {
        setScanResult('success');
        setMessage(data.message || 'Valid Ticket');
        setTicketDetails(data.ticket);

        // Add to history
        setScanHistory(prev => [{
          ticketId: data.ticket?.id,
          name: data.ticket?.name,
          time: new Date().toLocaleTimeString(),
          status: 'success'
        }, ...prev.slice(0, 9)]);

      } else {
        setScanResult('error');
        setMessage(data.message || 'Invalid Ticket');

        // Add to history
        setScanHistory(prev => [{
          ticketId: parsed.tid,
          name: 'Unknown',
          time: new Date().toLocaleTimeString(),
          status: 'error'
        }, ...prev.slice(0, 9)]);
      }

    } catch (error) {
      console.error('Validation Error:', error);
      setScanResult('error');

      if (!isOnline) {
        setMessage('No Internet Connection. Please try again when online.');
      } else {
        setMessage(error.message || 'Scan Failed. Please Try Again.');
      }
    } finally {
      setLoading(false);
      setTimeout(() => setHasScanned(false), 2000);
    }
  };

  // ✅ FIXED: Better error handling with fallback modes
  const handleError = (error) => {
    console.error('Scanner Error:', error);

    if (error?.name === 'OverconstrainedError' || error?.constraint === 'aspectRatio') {
      console.log('Camera constraint error, trying fallback mode...');
      setCameraError('Adjusting camera settings...');
      
      // Try switching camera mode
      setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
      
      setTimeout(() => {
        setCameraError(null);
      }, 1000);
      
    } else if (error?.name === 'NotAllowedError') {
      setCameraError('Camera access denied. Please enable camera permissions in your browser settings.');
    } else if (error?.name === 'NotFoundError') {
      setCameraError('No camera found on this device.');
    } else {
      setCameraError(error?.message || 'Camera error occurred. Try switching cameras.');
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setMessage('');
    setTicketDetails(null);
    setCameraError(null);
    setHasScanned(false);
  };

  // ✅ Toggle camera (front/back)
  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    setCameraError(null);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center p-4 text-white relative">

      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 p-2 bg-gray-800 rounded-full z-50 hover:bg-gray-700 transition-colors"
      >
        <ArrowLeft className="w-6 h-6 text-white"/>
      </button>

      {/* Network Status Indicator */}
      <div className="absolute top-4 right-4 z-50">
        {isOnline ? (
          <div className="flex items-center gap-2 bg-green-600 px-3 py-1 rounded-full">
            <Wifi className="w-4 h-4" />
            <span className="text-xs">Online</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full animate-pulse">
            <WifiOff className="w-4 h-4" />
            <span className="text-xs">Offline</span>
          </div>
        )}
      </div>

      {/* HEADER */}
      <div className="mb-8 mt-16 text-center">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Camera className="w-6 h-6 text-green-400"/> Ticket Entry
        </h1>
        <p className="text-gray-400 text-sm mt-1">Align QR code within frame</p>
      </div>

      {/* Camera Error Display */}
      {cameraError && !scanResult && (
        <div className="w-full max-w-sm bg-yellow-600 rounded-2xl p-6 text-center mb-4">
          <AlertCircle className="w-12 h-12 mx-auto mb-3" />
          <p className="text-sm font-semibold mb-3">{cameraError}</p>
          <div className="flex gap-2">
            <button
              onClick={toggleCamera}
              className="flex-1 bg-white text-yellow-700 px-4 py-2 rounded-lg font-semibold"
            >
              Switch Camera
            </button>
            <button
              onClick={resetScanner}
              className="flex-1 bg-white text-yellow-700 px-4 py-2 rounded-lg font-semibold"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* SCANNER CAMERA - ✅ FIXED with better constraints */}
      {!scanResult && !cameraError && (
        <div className="w-full max-w-sm aspect-square border-2 border-gray-700 rounded-3xl overflow-hidden shadow-2xl relative bg-gray-900">
           <Scanner
              onScan={handleScan}
              onError={handleError}
              constraints={{
                facingMode: facingMode,
                // ✅ REMOVED aspectRatio - this was causing OverconstrainedError
              }}
              scanDelay={1000}
              components={{
                audio: false,
                torch: true,
                finder: true,
                zoom: false
              }}
              styles={{
                container: {
                  width: '100%',
                  height: '100%'
                }
              }}
           />

           {/* Visual Guides */}
           <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none">
             <div className="w-full h-full border-2 border-white/30 rounded-lg relative">
                <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-red-500/50 animate-pulse"></div>
             </div>
           </div>

           {/* Camera Switch Button */}
           <button
             onClick={toggleCamera}
             className="absolute bottom-4 right-4 bg-gray-800/80 p-3 rounded-full z-50"
           >
             <RefreshCw className="w-5 h-5 text-white" />
           </button>

           {loading && (
             <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
               <div className="flex flex-col items-center">
                 <RefreshCw className="w-8 h-8 animate-spin text-green-500 mb-2"/>
                 <p className="font-bold">Verifying...</p>
               </div>
             </div>
           )}
        </div>
      )}

      {/* SUCCESS SCREEN */}
      {scanResult === 'success' && (
        <div className="w-full max-w-sm bg-green-600 rounded-3xl p-8 text-center shadow-2xl animate-in zoom-in duration-300 mt-10">
          <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-3xl font-black mb-2 tracking-tight">ACCESS GRANTED</h2>
          <p className="text-green-100 text-lg mb-6 font-medium">{message}</p>

          {ticketDetails && (
            <div className="bg-green-800/30 p-4 rounded-xl text-left space-y-1 mb-6 border border-green-400/30">
                <p className="text-xs text-green-200 uppercase font-bold">Ticket ID</p>
                <p className="text-xl font-bold text-white mb-2">{ticketDetails.id}</p>

                <p className="text-xs text-green-200 uppercase font-bold">Guest</p>
                <p className="text-xl font-bold text-white mb-2">{ticketDetails.name}</p>

                <p className="text-xs text-green-200 uppercase font-bold">Phone</p>
                <p className="text-base text-white">{ticketDetails.phone}</p>
            </div>
          )}

          <button onClick={resetScanner} className="w-full bg-white text-green-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 shadow-lg active:scale-95 transition-transform">
            <RefreshCw className="w-5 h-5"/> Scan Next
          </button>
        </div>
      )}

      {/* ERROR SCREEN */}
      {scanResult === 'error' && (
        <div className="w-full max-w-sm bg-red-600 rounded-3xl p-8 text-center shadow-2xl animate-in shake duration-300 mt-10">
          <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
          <h2 className="text-3xl font-black mb-2 tracking-tight">ACCESS DENIED</h2>
          <p className="text-red-100 text-xl font-medium mb-8">{message}</p>

          <button onClick={resetScanner} className="w-full bg-white text-red-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 shadow-lg active:scale-95 transition-transform">
            <RefreshCw className="w-5 h-5"/> Try Again
          </button>
        </div>
      )}

      {/* Scan History */}
      {scanHistory.length > 0 && !scanResult && (
        <div className="w-full max-w-sm mt-6 bg-gray-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold mb-3 text-gray-300">Recent Scans</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {scanHistory.map((scan, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs bg-gray-700 p-2 rounded-lg">
                <div>
                  <p className="font-semibold">{scan.ticketId}</p>
                  <p className="text-gray-400">{scan.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400">{scan.time}</p>
                  <span className={`${scan.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {scan.status === 'success' ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default TicketScanner;
