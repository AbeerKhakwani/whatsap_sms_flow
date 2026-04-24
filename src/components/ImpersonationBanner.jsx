import { useState, useEffect } from 'react';
import { Eye, EyeOff, X, AlertTriangle } from 'lucide-react';
import { getImpersonationState, setImpersonationState, clearImpersonation } from '../lib/impersonation';

export default function ImpersonationBanner() {
  const [state, setState] = useState(getImpersonationState());
  const [confirmingEdit, setConfirmingEdit] = useState(false);

  useEffect(() => {
    function handleStorage() {
      setState(getImpersonationState());
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (!state) return null;

  const editMode = !!state.editMode;

  function toggleEdit() {
    if (!editMode) {
      setConfirmingEdit(true);
      return;
    }
    const next = { ...state, editMode: false };
    setImpersonationState(next);
    setState(next);
  }

  function confirmEnableEdit() {
    const next = { ...state, editMode: true };
    setImpersonationState(next);
    setState(next);
    setConfirmingEdit(false);
  }

  function stopImpersonating() {
    clearImpersonation();
    window.location.href = '/admin/sellers';
  }

  return (
    <>
      <div className={`sticky top-0 z-50 px-4 py-2.5 text-sm font-medium border-b ${
        editMode
          ? 'bg-rose-600 text-white border-rose-700'
          : 'bg-indigo-600 text-white border-indigo-700'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            {editMode
              ? <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              : <Eye className="w-4 h-4 flex-shrink-0" />}
            <span className="truncate">
              {editMode ? 'EDIT MODE — ' : 'Viewing as '}
              <strong>{state.sellerEmail}</strong>
              <span className="opacity-75"> · admin: {state.adminEmail}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={toggleEdit}
              className="px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              {editMode ? <><EyeOff className="w-3.5 h-3.5" /> Read-only</> : <><AlertTriangle className="w-3.5 h-3.5" /> Switch to Edit Mode</>}
            </button>
            <button
              onClick={stopImpersonating}
              className="px-3 py-1 rounded-md bg-black/20 hover:bg-black/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> Stop viewing
            </button>
          </div>
        </div>
      </div>

      {confirmingEdit && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Enable Edit Mode?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Any changes you make will be saved <strong>as the seller</strong>.
                  They'll see edits, photo changes, deletions etc. as if they did them.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingEdit(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmEnableEdit}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Yes, enable edit mode
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function useImpersonation() {
  const [state, setState] = useState(getImpersonationState());
  useEffect(() => {
    function handleStorage() { setState(getImpersonationState()); }
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(() => setState(getImpersonationState()), 1000);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);
  return {
    isImpersonating: !!state,
    isReadOnly: !!state && !state.editMode,
    sellerEmail: state?.sellerEmail || null,
    adminEmail: state?.adminEmail || null
  };
}
