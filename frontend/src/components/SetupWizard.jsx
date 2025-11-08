import { useState, useEffect } from 'react';
import { setupAPI } from '../api/client';

const SetupWizard = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-detection results
  const [detection, setDetection] = useState(null);

  // Configuration
  const [config, setConfig] = useState({
    teddycloud_url: 'http://docker',
    custom_img_path: '/data/library/own/pics',
    custom_img_json_path: '/library/own/pics',
    ui_language: 'en',
    default_language: 'de-de',
    auto_parse_taf: true,
    selected_box: null,
  });

  // Connection test results
  const [teddycloudTest, setTeddycloudTest] = useState(null);
  const [boxes, setBoxes] = useState([]);

  // Auto-detect on mount
  useEffect(() => {
    detectDataAccess();
  }, []);

  const detectDataAccess = async () => {
    setLoading(true);
    try {
      const response = await setupAPI.detectDataAccess();
      setDetection(response.data);

      // If volume detected, pre-configure
      if (response.data.volume_available) {
        setConfig(prev => ({
          ...prev,
          custom_img_path: response.data.image_paths[0] || '/data/library/own/pics',
          custom_img_json_path: response.data.image_paths[0]?.replace('/data', '') || '/library/own/pics',
        }));
      }
    } catch (err) {
      console.error('Auto-detection failed:', err);
      setDetection({ volume_available: false });
    }
    setLoading(false);
  };

  const testTeddyCloudConnection = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await setupAPI.testTeddyCloud(config.teddycloud_url);
      setTeddycloudTest(response.data);
      if (response.data.success) {
        setBoxes(response.data.boxes || []);
        if (response.data.boxes?.length === 1) {
          setConfig(prev => ({ ...prev, selected_box: response.data.boxes[0].id }));
        }
      } else {
        setError(response.data.error || 'Connection failed');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Connection test failed');
      setTeddycloudTest({ success: false });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      await setupAPI.saveConfiguration(config);
      onComplete();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save configuration');
      setLoading(false);
    }
  };

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  const canProceed = () => {
    if (step === 1) return detection !== null;
    if (step === 2) return teddycloudTest?.success;
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            TeddyCloud Custom Tag Helper
          </h1>
          <p className="text-gray-600">Setup Wizard - Step {step} of 5</p>
          <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Data Access Detection */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Data Access Detection</h2>
            {loading ? (
              <p className="text-gray-600">Detecting data access methods...</p>
            ) : detection ? (
              <div className="space-y-4">
                {detection.volume_available ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center mb-2">
                      <svg className="w-6 h-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <h3 className="font-semibold text-green-900">Volume Mount Detected</h3>
                    </div>
                    <p className="text-green-700 text-sm mb-2">TeddyCloud data is accessible via volume mount</p>
                    <ul className="text-sm text-green-600 space-y-1">
                      <li>• Volume Path: {detection.volume_path}</li>
                      <li>• TAF Files Found: {detection.taf_files_found}</li>
                      <li>• Tonies Found: {detection.tonies_found}</li>
                      {detection.image_paths.length > 0 && (
                        <li>• Image Directories: {detection.image_paths.join(', ')}</li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h3 className="font-semibold text-yellow-900 mb-2">No Volume Detected</h3>
                    <p className="text-yellow-700 text-sm">
                      No TeddyCloud volume mount found. Please mount your TeddyCloud data directory at /data before proceeding.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-600">Failed to detect data access</p>
            )}
          </div>
        )}

        {/* Step 2: TeddyCloud Connection */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">TeddyCloud Connection</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  TeddyCloud URL
                </label>
                <input
                  type="text"
                  value={config.teddycloud_url}
                  onChange={(e) => setConfig({ ...config, teddycloud_url: e.target.value })}
                  placeholder="http://docker"
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the URL where TeddyCloud is running (without /web suffix)
                </p>
              </div>

              <button
                onClick={testTeddyCloudConnection}
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? 'Testing...' : 'Test Connection'}
              </button>

              {teddycloudTest && (
                <div className={`p-4 rounded-lg border ${
                  teddycloudTest.success
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <p className={`font-semibold ${
                    teddycloudTest.success ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {teddycloudTest.success ? 'Connection Successful!' : 'Connection Failed'}
                  </p>
                  {boxes.length > 0 && (
                    <p className="text-sm text-green-700 mt-1">
                      Found {boxes.length} Toniebox{boxes.length > 1 ? 'es' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Image Storage */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Image Storage</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Physical Image Path (Filesystem)
                </label>
                <input
                  type="text"
                  value={config.custom_img_path}
                  onChange={(e) => setConfig({ ...config, custom_img_path: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Where cover images will be saved on disk
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  JSON Image Path (TeddyCloud)
                </label>
                <input
                  type="text"
                  value={config.custom_img_json_path}
                  onChange={(e) => setConfig({ ...config, custom_img_json_path: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Path used in tonies.custom.json (usually without /data prefix)
                </p>
              </div>

              {detection?.image_paths && detection.image_paths.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 mb-2">Detected Paths:</p>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {detection.image_paths.map((path, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => setConfig({
                            ...config,
                            custom_img_path: path,
                            custom_img_json_path: path.replace('/data', ''),
                          })}
                          className="text-blue-600 hover:underline"
                        >
                          {path}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Toniebox Selection */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Toniebox Selection</h2>
            {boxes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-3">
                  {boxes.length > 1
                    ? 'Multiple Tonieboxes detected. Select your primary box:'
                    : 'One Toniebox detected:'}
                </p>
                {boxes.map((box) => (
                  <label key={box.id} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="radio"
                      name="box"
                      value={box.id}
                      checked={config.selected_box === box.id}
                      onChange={(e) => setConfig({ ...config, selected_box: e.target.value })}
                      className="mr-3"
                    />
                    <div>
                      <p className="font-medium">{box.name}</p>
                      <p className="text-xs text-gray-500">ID: {box.id}</p>
                    </div>
                  </label>
                ))}
                <p className="text-xs text-gray-500 mt-2">
                  You can change this later in settings (optional)
                </p>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-700">
                  No Tonieboxes detected or multiple boxes available. You can skip this step and configure later.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Preferences */}
        {step === 5 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Preferences</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  UI Language
                </label>
                <select
                  value={config.ui_language}
                  onChange={(e) => setConfig({ ...config, ui_language: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Audio Language
                </label>
                <select
                  value={config.default_language}
                  onChange={(e) => setConfig({ ...config, default_language: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="de-de">Deutsch</option>
                  <option value="en-us">English (US)</option>
                  <option value="en-gb">English (UK)</option>
                  <option value="fr-fr">Français</option>
                </select>
              </div>

              <label className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.auto_parse_taf}
                  onChange={(e) => setConfig({ ...config, auto_parse_taf: e.target.checked })}
                  className="mr-3"
                />
                <div>
                  <p className="font-medium">Auto-parse TAF files</p>
                  <p className="text-xs text-gray-500">
                    Automatically extract metadata when selecting TAF files
                  </p>
                </div>
              </label>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Configuration Summary</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• TeddyCloud: {config.teddycloud_url}</li>
                  <li>• Images: {config.custom_img_path}</li>
                  {config.selected_box && <li>• Selected Box: {boxes.find(b => b.id === config.selected_box)?.name}</li>}
                  <li>• Auto-parse TAF: {config.auto_parse_taf ? 'Enabled' : 'Disabled'}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <button
            onClick={prevStep}
            disabled={step === 1 || loading}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>

          {step < 5 ? (
            <button
              onClick={nextStep}
              disabled={!canProceed() || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Saving...' : 'Complete Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
