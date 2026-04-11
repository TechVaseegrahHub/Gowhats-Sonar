import { RouterProvider } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import router from './router/router.jsx';
import { Toaster } from 'react-hot-toast';
import './index.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { InstallPromptProvider } from './context/InstallPromptContext.jsx';

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <InstallPromptProvider>
      <RouterProvider router={router} />
      <Toaster />
    </InstallPromptProvider>
  </AuthProvider>
);
