import { useState, useRef } from 'react';
import { Upload, FileText, Users, Package, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export default function Import() {
  const [clientsFile, setClientsFile] = useState(null);
  const [productsFile, setProductsFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Metafield sync state
  const [syncFile, setSyncFile] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState('');

  const clientsInputRef = useRef(null);
  const productsInputRef = useRef(null);
  const syncInputRef = useRef(null);

  function handleFileSelect(e, type) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    if (type === 'clients') {
      setClientsFile(file);
    } else {
      setProductsFile(file);
    }
    setError('');
    setResult(null);
  }

  async function handleImport() {
    if (!clientsFile || !productsFile) {
      setError('Please select both CSV files');
      return;
    }

    setImporting(true);
    setError('');
    setResult(null);

    try {
      // Read files as text
      const clientsText = await clientsFile.text();
      const productsText = await productsFile.text();

      const response = await fetch('/api/import-sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientsCsv: clientsText,
          productsCsv: productsText
        })
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        setClientsFile(null);
        setProductsFile(null);
      } else {
        setError(data.error || 'Import failed');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function handleSyncFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setSyncError('Please select a CSV file');
      return;
    }

    setSyncFile(file);
    setSyncError('');
    setSyncResult(null);
  }

  async function handleSyncMetafields() {
    if (!syncFile) {
      setSyncError('Please select a products CSV file');
      return;
    }

    setSyncing(true);
    setSyncError('');
    setSyncResult(null);

    try {
      const productsText = await syncFile.text();

      const response = await fetch('/api/import-sellers?action=sync-metafields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productsCsv: productsText })
      });

      const data = await response.json();

      if (data.success) {
        setSyncResult(data);
        setSyncFile(null);
      } else {
        setSyncError(data.error || 'Sync failed');
      }
    } catch (err) {
      console.error('Sync error:', err);
      setSyncError('Something went wrong. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Import Sellers</h1>
        <p className="text-gray-600 mb-8">
          Upload CSV files to import sellers and link them to their Shopify products
        </p>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <h3 className="font-medium text-blue-900 mb-2">CSV Format Requirements</h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p><strong>Clients CSV:</strong> Must have columns: clientId, email (and optionally firstName, lastName, phone)</p>
            <p><strong>Products CSV:</strong> Must have columns: shopifyId, client (where client = clientId)</p>
          </div>
        </div>

        {/* File Upload */}
        <div className="space-y-4 mb-8">
          {/* Clients CSV */}
          <div
            onClick={() => clientsInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 cursor-pointer transition ${
              clientsFile
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={clientsInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleFileSelect(e, 'clients')}
              className="hidden"
            />
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${clientsFile ? 'bg-green-100' : 'bg-gray-100'}`}>
                <Users className={`w-6 h-6 ${clientsFile ? 'text-green-600' : 'text-gray-500'}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {clientsFile ? clientsFile.name : 'Clients CSV'}
                </p>
                <p className="text-sm text-gray-500">
                  {clientsFile ? 'Click to change' : 'Click to upload clients/sellers file'}
                </p>
              </div>
              {clientsFile && <CheckCircle className="w-5 h-5 text-green-600" />}
            </div>
          </div>

          {/* Products CSV */}
          <div
            onClick={() => productsInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 cursor-pointer transition ${
              productsFile
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={productsInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleFileSelect(e, 'products')}
              className="hidden"
            />
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${productsFile ? 'bg-green-100' : 'bg-gray-100'}`}>
                <Package className={`w-6 h-6 ${productsFile ? 'text-green-600' : 'text-gray-500'}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {productsFile ? productsFile.name : 'Products CSV'}
                </p>
                <p className="text-sm text-gray-500">
                  {productsFile ? 'Click to change' : 'Click to upload products file'}
                </p>
              </div>
              {productsFile && <CheckCircle className="w-5 h-5 text-green-600" />}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="font-medium text-green-800">Import Completed! {result.total} sellers with products imported.</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white rounded-lg p-3">
                <p className="text-2xl font-bold text-green-600">{result.created}</p>
                <p className="text-sm text-gray-600">Created</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-sm text-gray-600">Updated</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                <p className="text-sm text-gray-600">Skipped (no email)</p>
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-800 mb-2">Errors:</p>
                <ul className="text-xs text-red-700 space-y-1">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>...and {result.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={!clientsFile || !productsFile || importing}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {importing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              Import Sellers
            </>
          )}
        </button>

        {/* Divider */}
        <div className="my-12 border-t border-gray-200 pt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sync Shopify Metafields</h2>
          <p className="text-gray-600 mb-6">
            Update Shopify product metafields with pricing info from CSV (commission rate, seller payout, etc.)
          </p>

          {/* Instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-amber-900 mb-2">What this does</h3>
            <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
              <li>Sets <code className="bg-amber-100 px-1 rounded">seller.id</code> metafield from <code className="bg-amber-100 px-1 rounded">client</code> column</li>
              <li>Calculates commission: <code className="bg-amber-100 px-1 rounded">100 - splitForCustomer</code></li>
              <li>Calculates asking price: <code className="bg-amber-100 px-1 rounded">retailPrice - $10</code></li>
              <li>Calculates seller payout: <code className="bg-amber-100 px-1 rounded">askingPrice × splitForCustomer%</code></li>
              <li>Updates inventory cost to seller payout amount</li>
            </ul>
          </div>

          {/* Sync File Upload */}
          <div
            onClick={() => syncInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 cursor-pointer transition mb-6 ${
              syncFile
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={syncInputRef}
              type="file"
              accept=".csv"
              onChange={handleSyncFileSelect}
              className="hidden"
            />
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${syncFile ? 'bg-green-100' : 'bg-gray-100'}`}>
                <Package className={`w-6 h-6 ${syncFile ? 'text-green-600' : 'text-gray-500'}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {syncFile ? syncFile.name : 'Products CSV'}
                </p>
                <p className="text-sm text-gray-500">
                  {syncFile ? 'Click to change' : 'Must have: shopifyId, retailPrice, splitForCustomer, client'}
                </p>
              </div>
              {syncFile && <CheckCircle className="w-5 h-5 text-green-600" />}
            </div>
          </div>

          {/* Sync Error */}
          {syncError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800">{syncError}</p>
            </div>
          )}

          {/* Sync Result */}
          {syncResult && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="font-medium text-green-800">Sync Complete! {syncResult.synced} products updated.</p>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-2xl font-bold text-green-600">{syncResult.synced}</p>
                  <p className="text-sm text-gray-600">Synced</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-600">{syncResult.skipped}</p>
                  <p className="text-sm text-gray-600">Skipped</p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-2xl font-bold text-blue-600">{syncResult.total}</p>
                  <p className="text-sm text-gray-600">Total</p>
                </div>
              </div>
              {syncResult.errors && syncResult.errors.length > 0 && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg">
                  <p className="text-sm font-medium text-red-800 mb-2">Errors:</p>
                  <ul className="text-xs text-red-700 space-y-1">
                    {syncResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {syncResult.errors.length > 5 && (
                      <li>...and {syncResult.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Sync Button */}
          <button
            onClick={handleSyncMetafields}
            disabled={!syncFile || syncing}
            className="w-full bg-amber-600 text-white py-3 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {syncing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Syncing Metafields...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Sync Metafields to Shopify
              </>
            )}
          </button>
        </div>
    </div>
  );
}
