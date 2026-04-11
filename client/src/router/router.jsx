// router/router.jsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Login } from '../pages/Login';
import { SignUp } from '../pages/Signup';
import Layout from '../components/Layout';
import Dashboard from '../pages/Dashboard';
import ChatContainer from '../components/ChatContainer';
import Templates from '../pages/Templates';
import Settings from '../pages/Settings';
import InventoryPage from '../pages/Inventory';
import WhatsAppConnect from '../pages/WhatsAppConnect';
import Analytics from '../pages/Analytics';
import WhatsAppConnected from '../pages/WhatsAppConnected';
import UserDetails from '../pages/UserDetails';
import ResetPassword from '../pages/ResetPassword';
import BroadcastMessage from '../pages/BroadcastMessage';
import StoreIntegration from '../pages/StoreIntegration';
import FulfillmentFlow from '../pages/FulfillmentFlow';
import OrderSheet from '../components/OrderSheet';
import FileUpload from '../pages/FileUpload';
import RegistrationFormConfig from '../components/RegistrationFormConfig';
import OrderAutomationConfig from '../components/OrderAutomationConfig';
import PaymentSuccess from '../pages/PaymentSuccess';
import FlowQuestionsPage from '../pages/FlowQuestionsPage';
import AdminDashboard from '../pages/AdminDashboard';
import AdminReferralReports from '../pages/AdminReferralReports';
import EventPage from '../pages/EventPage';
import ReferralPortal from '../pages/ReferralPortal';
import WooRestockLanding from '../pages/WooRestockLanding';
import WooRestockPublicForm from '../pages/WooRestockPublicForm';

const ProtectedLayout = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout />;
};

const router = createBrowserRouter([
  // ─── Public routes ───────────────────────────────────────────────
  {
    path: '/',
    element: <Login />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/signup',
    element: <SignUp />,
  },
  {
    path: '/reset-password',
    element: <ResetPassword />,
  },
  {
    path: '/payment-success',
    element: <PaymentSuccess />,
  },
  {
    path: '/referral',
    element: <ReferralPortal />,
  },
  {
    path: '/referral/login',
    element: <ReferralPortal />,
  },
  {
    path: '/referral/signup',
    element: <ReferralPortal />,
  },
  {
    path: '/referral/dashboard',
    element: <ReferralPortal />,
  },
  {
    path: '/restock/woocommerce/:integrationId',
    element: <WooRestockPublicForm />,
  },

  // ─── Admin super dashboard (separate, not inside Layout) ─────────
  {
    path: '/adminDashboard',
    element: <AdminDashboard />,
  },
  {
    path: '/admin-dashboard',
    element: <AdminDashboard />,
  },
  {
    path: '/adminDashboard/referrals',
    element: <AdminReferralReports />,
  },
  {
    path: '/admin-dashboard/referrals',
    element: <AdminReferralReports />,
  },

  // ─── Protected admin routes ──────────────────────────────────────
  {
    path: '/admin',
    element: <ProtectedLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'chats',
        element: <ChatContainer />,
      },
      {
        path: 'templates',
        element: <Templates />,
      },
      {
        path: 'analytics',
        element: <Analytics />,
      },
      {
        path: 'connect-whatsapp',
        element: <WhatsAppConnect />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'file-upload',
        element: <FileUpload />,
      },
      {
        path: 'BroadcastMessage',
        element: <BroadcastMessage />,
      },
      {
        path: 'inventory',
        element: <InventoryPage />,
      },
      {
        path: 'UserDetails',
        element: <UserDetails />,
      },
      {
        path: 'store-integration',
        element: <StoreIntegration />,
      },
      {
        path: 'fulfillment-flow',
        element: <FulfillmentFlow />,
      },
      {
        path: 'events',
        element: <EventPage />,
      },
      {
        path: 'ordersheet',
        element: <OrderSheet />,
      },
      {
        path: 'OrderSheet',
        element: <OrderSheet />,
      },
      {
        path: 'booking-automation',
        element: <RegistrationFormConfig />,
      },
      {
        path: 'order-automation',
        element: <OrderAutomationConfig />,
      },
      {
        path: 'flow-questions',
        element: <FlowQuestionsPage />,
      },
      {
        path: 'restock/woocommerce/:integrationId',
        element: <WooRestockLanding />,
      },
    ],
  },

  // ─── Catch-all ───────────────────────────────────────────────────
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export default router;

