import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, MessageCircle } from 'lucide-react';

const PaymentSuccess = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('order');

    return (
        <div className="min-h-screen bg-green-50 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center border border-green-100">
                {/* Success Icon */}
                <div className="flex justify-center mb-6">
                    <div className="bg-green-100 p-4 rounded-full">
                        <CheckCircle size={60} className="text-green-600" />
                    </div>
                </div>

                {/* Main Text */}
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Successful</h1>
                <p className="text-xl text-green-700 font-medium mb-6">Your booking is confirmed!</p>

                {/* Order ID Box */}
                <div className="bg-gray-50 rounded-2xl p-4 mb-8">
                    <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mb-1">Order ID</p>
                    <p className="text-lg font-mono font-bold text-blue-600">{orderId || "Confirmed"}</p>
                </div>

                {/* Info Box */}
                <div className="flex items-start gap-3 text-left bg-blue-50 p-4 rounded-2xl mb-8">
                    <MessageCircle className="text-blue-600 shrink-0 mt-1" size={20} />
                    <p className="text-sm text-blue-800">
                        We have sent your <strong>QR Code Ticket</strong> to your WhatsApp number. Please check your messages.
                    </p>
                </div>

                {/* Navigation */}
                <Link 
                    to="/" 
                    className="block w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl transition-all shadow-lg mb-4"
                >
                    Return Home
                </Link>
            </div>
        </div>
    );
};

export default PaymentSuccess;
