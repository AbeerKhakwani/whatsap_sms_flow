import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Listings from './pages/Listings';
import Sellers from './pages/Sellers';
import SellerDetail from './pages/SellerDetail';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import TestSMS from './pages/TestSMS';
import SubmitListing from './pages/SubmitListing';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/submit" element={<SubmitListing />} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/sellers" element={<Sellers />} />
              <Route path="/sellers/:id" element={<SellerDetail />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/test-sms" element={<TestSMS />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </Router>
  );
}
