import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminReferralSection from '../components/AdminReferralSection';

export default function AdminReferralReports() {
  const navigate = useNavigate();
  const adminToken = localStorage.getItem('admin_token');

  if (!adminToken) {
    return <Navigate to="/adminDashboard" replace />;
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    toast.success('Logged out from admin panel');
    navigate('/adminDashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.09),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] font-sans">
      <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/78 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-600 shadow-lg shadow-emerald-500/20">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                  Referral Reports
                </h1>
                <p className="text-[11px] font-medium text-slate-400 -mt-0.5">
                  Digital marketing partner onboarding and payment reports
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate('/adminDashboard')}
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all font-semibold text-sm active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back To Dashboard</span>
              </button>

              <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all font-semibold text-sm active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <AdminReferralSection />
      </div>
    </div>
  );
}

