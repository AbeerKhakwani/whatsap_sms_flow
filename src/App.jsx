import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';

// Eager load - needed immediately
import SellerLogin from './pages/seller/SellerLogin';
import SellerDashboard from './pages/seller/SellerDashboard';

// Lazy load - only when needed
const SellerSubmit = lazy(() => import('./pages/seller/SellerSubmit'));
const SellerProfile = lazy(() => import('./pages/seller/SellerProfile'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const Layout = lazy(() => import('./components/Layout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Sellers = lazy(() => import('./pages/Sellers'));
const SellerDetail = lazy(() => import('./pages/SellerDetail'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Scripts = lazy(() => import('./pages/Scripts'));
const Settings = lazy(() => import('./pages/Settings'));

// Loading splash screen
function Loading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center relative">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover absolute inset-0"
      >
        <source src="/loading.mov" type="video/quicktime" />
        <source src="/loading.mp4" type="video/mp4" />
      </video>
      <p className="relative z-10 text-black text-lg font-medium">Loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Seller Portal - Home is seller dashboard */}
          <Route path="/" element={<SellerDashboard />} />
          <Route path="/login" element={<SellerLogin />} />
          <Route path="/submit" element={<SellerSubmit />} />

          {/* Legacy seller routes (redirect-friendly) */}
          <Route path="/seller" element={<SellerDashboard />} />
          <Route path="/seller/login" element={<SellerLogin />} />
          <Route path="/seller/submit" element={<SellerSubmit />} />
          <Route path="/seller/profile" element={<SellerProfile />} />
          <Route path="/profile" element={<SellerProfile />} />

          {/* Admin Login */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Admin Dashboard Routes */}
          <Route path="/admin/*" element={
            <Layout>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/sellers" element={<Sellers />} />
                <Route path="/sellers/:id" element={<SellerDetail />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/scripts" element={<Scripts />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          } />
        </Routes>
      </Suspense>
    </Router>
  );
}
