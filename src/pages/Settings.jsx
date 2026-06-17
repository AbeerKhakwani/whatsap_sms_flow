import { useState, useEffect } from 'react';
import { Lock, Loader2, Check, ShieldCheck } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Settings() {
  // master = signed in via the email-code (Gmail) login. UI hint only — the real
  // gate is the JWT 'master' check on the server (list-admins / set-admin-password).
  const isMaster = localStorage.getItem('admin_master') === '1';
  const token = localStorage.getItem('admin_token');

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(isMaster);
  const [pwInputs, setPwInputs] = useState({});   // email -> new password
  const [savingEmail, setSavingEmail] = useState(null);
  const [msg, setMsg] = useState({});             // email -> { type, text }

  useEffect(() => { if (isMaster) loadAdmins(); /* eslint-disable-next-line */ }, []);

  async function loadAdmins() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'list-admins' }),
      });
      const data = await res.json();
      if (data.success) setAdmins(data.admins);
    } catch (e) {
      /* leave list empty on failure */
    } finally {
      setLoading(false);
    }
  }

  async function savePassword(email) {
    const password = (pwInputs[email] || '').trim();
    if (password.length < 8) {
      setMsg(m => ({ ...m, [email]: { type: 'error', text: 'Use at least 8 characters.' } }));
      return;
    }
    setSavingEmail(email);
    setMsg(m => ({ ...m, [email]: null }));
    try {
      const res = await fetch(`${API_URL}/api/admin-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'set-admin-password', email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg(m => ({ ...m, [email]: { type: 'ok', text: 'Password updated.' } }));
        setPwInputs(p => ({ ...p, [email]: '' }));
        loadAdmins();
      } else {
        setMsg(m => ({ ...m, [email]: { type: 'error', text: data.error || 'Failed to save.' } }));
      }
    } catch (e) {
      setMsg(m => ({ ...m, [email]: { type: 'error', text: e.message } }));
    } finally {
      setSavingEmail(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-500 mb-8">Manage your team's dashboard access.</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-medium text-gray-900">Team passwords</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Each teammate signs in with just their password. Set or reset them here.
        </p>

        {!isMaster ? (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg">
            Only the master login can manage passwords. Sign out and sign back in using
            <strong> “Sign in with an email code instead”</strong> to make changes here.
          </div>
        ) : loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-5">
            {admins.map(a => (
              <div key={a.email} className="border-b border-gray-100 pb-5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium text-gray-900">{a.name}</div>
                    <div className="text-xs text-gray-500">{a.email}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${a.hasPassword ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {a.hasPassword ? 'Password set' : 'No password yet'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      value={pwInputs[a.email] || ''}
                      onChange={e => setPwInputs(p => ({ ...p, [a.email]: e.target.value }))}
                      placeholder={a.hasPassword ? 'New password' : 'Set a password'}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
                    />
                  </div>
                  <button
                    onClick={() => savePassword(a.email)}
                    disabled={savingEmail === a.email || !(pwInputs[a.email] || '').trim()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1"
                  >
                    {savingEmail === a.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                </div>
                {msg[a.email] && (
                  <p className={`text-xs mt-2 ${msg[a.email].type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                    {msg[a.email].text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
