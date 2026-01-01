import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Listings from './pages/Listings';
import Sellers from './pages/Sellers';
import SellerDetail from './pages/SellerDetail';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import TestSMS from './pages/TestSMS';
import Import from './pages/Import';
import AdminLogin from './pages/AdminLogin';

// Seller Portal
import SellerLogin from './pages/seller/SellerLogin';
import SellerDashboard from './pages/seller/SellerDashboard';
import SellerSubmit from './pages/seller/SellerSubmit';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Seller Portal Routes (separate from admin) */}
        <Route path="/seller/login" element={<SellerLogin />} />
        <Route path="/seller" element={<SellerDashboard />} />
        <Route path="/seller/submit" element={<SellerSubmit />} />

        {/* Admin Login */}
        <Route path="/login" element={<AdminLogin />} />

        {/* Admin Dashboard Routes */}
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/sellers" element={<Sellers />} />
              <Route path="/sellers/:id" element={<SellerDetail />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/import" element={<Import />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/test-sms" element={<TestSMS />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </Router>
  );
}
