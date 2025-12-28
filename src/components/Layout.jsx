import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Users, DollarSign, Settings, Send, PlusCircle } from 'lucide-react';

export default function Layout({ children }) {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Submit', path: '/submit', icon: PlusCircle },
    { name: 'Listings', path: '/listings', icon: Package },
    { name: 'Sellers', path: '/sellers', icon: Users },
    { name: 'Transactions', path: '/transactions', icon: DollarSign },
    { name: 'Test SMS', path: '/test-sms', icon: Send },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-gradient-to-b from-primary-500 to-primary-600 text-white flex flex-col">
        <div className="p-6 border-b border-primary-400">
          <h1 className="text-2xl font-bold">The Phir Story</h1>
          <p className="text-sm text-primary-100 mt-1">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                  ${isActive 
                    ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-700' 
                    : 'text-white hover:bg-primary-400/50'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-primary-400 text-xs text-primary-100">
          <p>Version 1.0.0</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
