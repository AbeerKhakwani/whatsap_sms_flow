import { useState } from 'react';
import { Play, CheckCircle, XCircle, Clock, AlertCircle, Terminal } from 'lucide-react';

export default function Scripts() {
  const [running, setRunning] = useState(null);
  const [results, setResults] = useState({});

  const scripts = [
    {
      id: 'create-definitions',
      name: 'Create Metafield Definitions',
      description: 'Creates structured metafield definitions in Shopify (seller email, phone, payout, etc.). Safe to run multiple times.',
      endpoint: '/api/scripts?action=create-definitions',
      icon: '📝',
      category: 'metafields',
      duration: '~30 seconds'
    },
    {
      id: 'backfill-metafields',
      name: 'Backfill Metafields',
      description: 'Migrates existing products from unstructured to structured metafields. Only updates empty fields.',
      endpoint: '/api/scripts?action=backfill-metafields',
      icon: '🔄',
      category: 'metafields',
      duration: '~2-5 minutes',
      warning: 'This will process all products in Shopify. Run after creating definitions.'
    }
  ];

  async function runScript(script) {
    setRunning(script.id);
    setResults(prev => ({
      ...prev,
      [script.id]: { status: 'running', output: [], startTime: Date.now() }
    }));

    try {
      const response = await fetch(script.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        setResults(prev => ({
          ...prev,
          [script.id]: {
            status: 'success',
            output: data.output || [],
            summary: data.summary,
            duration: Date.now() - prev[script.id].startTime
          }
        }));
      } else {
        setResults(prev => ({
          ...prev,
          [script.id]: {
            status: 'error',
            output: data.output || [],
            error: data.error,
            duration: Date.now() - prev[script.id].startTime
          }
        }));
      }
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [script.id]: {
          status: 'error',
          output: [],
          error: error.message,
          duration: Date.now() - (prev[script.id]?.startTime || Date.now())
        }
      }));
    }

    setRunning(null);
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'running':
        return <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Scripts</h1>
        <p className="text-gray-500 text-sm">Run maintenance and migration scripts</p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-900 font-medium">Scripts use production Shopify credentials</p>
            <p className="text-sm text-blue-700 mt-1">
              These scripts run directly against your live Shopify store. They are designed to be safe and idempotent (can run multiple times).
            </p>
          </div>
        </div>
      </div>

      {/* Metafields Scripts Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Metafield Migration</h2>
          <p className="text-sm text-gray-500 mt-1">Convert unstructured metafields to structured, pinned definitions</p>
        </div>

        <div className="divide-y divide-gray-100">
          {scripts.filter(s => s.category === 'metafields').map((script) => {
            const result = results[script.id];

            return (
              <div key={script.id} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="text-3xl">{script.icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{script.name}</h3>
                      {result && getStatusIcon(result.status)}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{script.description}</p>

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {script.duration}
                      </span>
                      {script.warning && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertCircle className="w-3 h-3" />
                          {script.warning}
                        </span>
                      )}
                    </div>

                    {/* Result Output */}
                    {result && (
                      <div className="mt-4">
                        {result.status === 'running' && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-900 font-medium flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                              Running script...
                            </p>
                          </div>
                        )}

                        {result.status === 'success' && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-sm text-green-900 font-medium flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              Success!
                            </p>
                            {result.summary && (
                              <div className="mt-2 space-y-1">
                                {Object.entries(result.summary).map(([key, value]) => (
                                  <p key={key} className="text-sm text-green-800">
                                    <span className="font-medium">{key}:</span> {value}
                                  </p>
                                ))}
                              </div>
                            )}
                            {result.output && result.output.length > 0 && (
                              <div className="mt-2 bg-white rounded border border-green-200 p-2 max-h-40 overflow-y-auto">
                                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                                  {result.output.join('\n')}
                                </pre>
                              </div>
                            )}
                            <p className="text-xs text-green-700 mt-2">
                              Completed in {Math.round(result.duration / 1000)}s
                            </p>
                          </div>
                        )}

                        {result.status === 'error' && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="text-sm text-red-900 font-medium flex items-center gap-2">
                              <XCircle className="w-4 h-4" />
                              Error
                            </p>
                            <p className="text-sm text-red-800 mt-1">{result.error}</p>
                            {result.output && result.output.length > 0 && (
                              <div className="mt-2 bg-white rounded border border-red-200 p-2 max-h-40 overflow-y-auto">
                                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                                  {result.output.join('\n')}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => runScript(script)}
                    disabled={running === script.id || running !== null}
                    className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                  >
                    {running === script.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Running
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex gap-3">
          <Terminal className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700">
            <p className="font-medium text-gray-900 mb-2">Running Order:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>First run "Create Metafield Definitions" (one-time setup)</li>
              <li>Then run "Backfill Metafields" to migrate existing products</li>
              <li>All future products will automatically use structured metafields</li>
            </ol>
            <p className="mt-3 text-gray-600">
              Check the results in Shopify Admin → Settings → Custom data → Products
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
