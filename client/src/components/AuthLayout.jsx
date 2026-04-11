import React from 'react';
import { motion } from 'framer-motion';

const AuthLayout = ({ children, panelContent, isLogin }) => {
  return (
    <div
      className="w-screen h-screen flex overflow-hidden font-['Sora']"
      style={{ background: '#ffffff' }}
    >
      {/* ── Form Side (pure white) ── */}
      <div
        className={`
          flex flex-col justify-center items-center
          w-full lg:w-[52%] h-full
          bg-white overflow-y-auto
          px-6 py-8
          ${isLogin ? 'order-1' : 'order-2'}
        `}
      >
        <div className="w-full max-w-[420px]">
          {children}
        </div>
      </div>

      {/* ── Green Panel (desktop only) ── */}
      <motion.div
        initial={{ opacity: 0, x: isLogin ? 40 : -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`
          hidden lg:flex flex-col justify-center items-center
          lg:w-[48%] h-full relative overflow-hidden
          ${isLogin ? 'order-2' : 'order-1'}
        `}
        style={{ background: '#21b457' }}
      >
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Soft glow top-left */}
        <div
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        {/* Soft glow bottom-right */}
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0,0,0,0.08) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Panel content */}
        <div className="relative z-10 w-full px-10">
          {panelContent}
        </div>
      </motion.div>
    </div>
  );
};

export default AuthLayout;
