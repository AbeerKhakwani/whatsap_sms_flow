import { useState, useRef } from 'react';
import { Upload, FileText, Users, Package, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function Import() {
  const [clientsFile, setClientsFile] = useState(null);
  const [productsFile, setProductsFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const clientsInputRef = useRef(null);
  const productsInputRef = useRef(null);

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
    </div>
  );
}
