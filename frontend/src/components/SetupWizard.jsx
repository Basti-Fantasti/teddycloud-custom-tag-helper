import { useState, useEffect, useContext } from 'react';
import { setupAPI } from '../api/client';
import { TranslationContext } from '../context/TranslationContext';

const SetupWizard = ({ onComplete }) => {
  const { language, setLanguage, t } = useContext(TranslationContext);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-detection results
  const [detection, setDetection] = useState(null);

  // Configuration
  const [config, setConfig] = useState({
    teddycloud_url: 'http://docker',
    custom_img_path: '/data/library/own/pics',
    custom_img_json_path: '/library/own/pics',
    ui_language: language,
    default_language: 'de-de',
    auto_parse_taf: true,
    selected_box: null,
  });

  // Connection test results
  const [teddycloudTest, setTeddycloudTest] = useState(null);
  const [boxes, setBoxes] = useState([]);

  // Total number of steps (0-5)
  const TOTAL_STEPS = 6;

  // Update config when language changes
  useEffect(() => {
    setConfig(prev => ({ ...prev, ui_language: language }));
  }, [language]);

  // Auto-detect on mount (but don't show loading on language step)
  useEffect(() => {
    detectDataAccess();
  }, []);

  const detectDataAccess = async () => {
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
        setError(response.data.error || t('setupWizard.connection.failed'));
      }
    } catch (err) {
      setError(err.response?.data?.detail || t('setupWizard.connection.failed'));
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

  const handleLanguageSelect = (lang) => {
    setLanguage(lang);
  };

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  const canProceed = () => {
    if (step === 0) return true; // Language step - always can proceed
    if (step === 1) return detection !== null;
    if (step === 2) return teddycloudTest?.success;
    return true;
  };

  const getLanguageDisplayName = (langCode) => {
    return t(`setupWizard.languages.${langCode}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('setupWizard.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('setupWizard.stepOf', { current: step + 1, total: TOTAL_STEPS })}
          </p>
          <div className="mt-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Step 0: Language Selection */}
        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              {t('setupWizard.language.title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t('setupWizard.language.description')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleLanguageSelect('en')}
                className={`p-6 rounded-lg border-2 transition-all flex flex-col items-center gap-3 ${
                  language === 'en'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                }`}
              >
                <span className="text-4xl">🇬🇧</span>
                <span className="font-medium text-gray-900 dark:text-white">English</span>
              </button>
              <button
                onClick={() => handleLanguageSelect('de')}
                className={`p-6 rounded-lg border-2 transition-all flex flex-col items-center gap-3 ${
                  language === 'de'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                }`}
              >
                <span className="text-4xl">🇩🇪</span>
                <span className="font-medium text-gray-900 dark:text-white">Deutsch</span>
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-4 text-center">
              {t('setupWizard.language.detected', { language: getLanguageDisplayName(language) })}
            </p>
          </div>
        )}

        {/* Step 1: Data Access Detection */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              {t('setupWizard.dataAccess.title')}
            </h2>
            {detection === null ? (
              <p className="text-gray-600 dark:text-gray-400">
                {t('setupWizard.dataAccess.detecting')}
              </p>
            ) : detection ? (
              <div className="space-y-4">
                {detection.volume_available ? (
                  <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center mb-2">
                      <svg className="w-6 h-6 text-green-600 dark:text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <h3 className="font-semibold text-green-900 dark:text-green-300">
                        {t('setupWizard.dataAccess.volumeDetected')}
                      </h3>
                    </div>
                    <p className="text-green-700 dark:text-green-400 text-sm mb-2">
                      {t('setupWizard.dataAccess.volumeDescription')}
                    </p>
                    <ul className="text-sm text-green-600 dark:text-green-400 space-y-1">
                      <li>• {t('setupWizard.dataAccess.volumePath')}: {detection.volume_path}</li>
                      <li>• {t('setupWizard.dataAccess.tafFilesFound')}: {detection.taf_files_found}</li>
                      <li>• {t('setupWizard.dataAccess.toniesFound')}: {detection.tonies_found}</li>
                      {detection.image_paths.length > 0 && (
                        <li>• {t('setupWizard.dataAccess.imageDirectories')}: {detection.image_paths.join(', ')}</li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
                      {t('setupWizard.dataAccess.noVolumeDetected')}
                    </h3>
                    <p className="text-yellow-700 dark:text-yellow-400 text-sm">
                      {t('setupWizard.dataAccess.noVolumeDescription')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-600 dark:text-red-400">
                {t('setupWizard.dataAccess.detectionFailed')}
              </p>
            )}
          </div>
        )}

        {/* Step 2: TeddyCloud Connection */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              {t('setupWizard.connection.title')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('setupWizard.connection.urlLabel')}
                </label>
                <input
                  type="text"
                  value={config.teddycloud_url}
                  onChange={(e) => setConfig({ ...config, teddycloud_url: e.target.value })}
                  placeholder={t('setupWizard.connection.urlPlaceholder')}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('setupWizard.connection.urlHelp')}
                </p>
              </div>

              <button
                onClick={testTeddyCloudConnection}
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? t('setupWizard.connection.testing') : t('setupWizard.connection.testConnection')}
              </button>

              {teddycloudTest && (
                <div className={`p-4 rounded-lg border ${
                  teddycloudTest.success
                    ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
                }`}>
                  <p className={`font-semibold ${
                    teddycloudTest.success
                      ? 'text-green-900 dark:text-green-300'
                      : 'text-red-900 dark:text-red-300'
                  }`}>
                    {teddycloudTest.success
                      ? t('setupWizard.connection.success')
                      : t('setupWizard.connection.failed')}
                  </p>
                  {boxes.length > 0 && (
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                      {boxes.length > 1
                        ? t('setupWizard.connection.boxesFoundPlural', { count: boxes.length })
                        : t('setupWizard.connection.boxesFound', { count: boxes.length })}
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
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              {t('setupWizard.imageStorage.title')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('setupWizard.imageStorage.physicalPathLabel')}
                </label>
                <input
                  type="text"
                  value={config.custom_img_path}
                  onChange={(e) => setConfig({ ...config, custom_img_path: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('setupWizard.imageStorage.physicalPathHelp')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('setupWizard.imageStorage.jsonPathLabel')}
                </label>
                <input
                  type="text"
                  value={config.custom_img_json_path}
                  onChange={(e) => setConfig({ ...config, custom_img_json_path: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('setupWizard.imageStorage.jsonPathHelp')}
                </p>
              </div>

              {detection?.image_paths && detection.image_paths.length > 0 && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                    {t('setupWizard.imageStorage.detectedPaths')}
                  </p>
                  <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                    {detection.image_paths.map((path, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => setConfig({
                            ...config,
                            custom_img_path: path,
                            custom_img_json_path: path.replace('/data', ''),
                          })}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
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
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              {t('setupWizard.boxSelection.title')}
            </h2>
            {boxes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {boxes.length > 1
                    ? t('setupWizard.boxSelection.multipleDetected')
                    : t('setupWizard.boxSelection.oneDetected')}
                </p>
                {boxes.map((box) => (
                  <label key={box.id} className="flex items-center p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="box"
                      value={box.id}
                      checked={config.selected_box === box.id}
                      onChange={(e) => setConfig({ ...config, selected_box: e.target.value })}
                      className="mr-3"
                    />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{box.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">ID: {box.id}</p>
                    </div>
                  </label>
                ))}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('setupWizard.boxSelection.changeLater')}
                </p>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className="text-gray-700 dark:text-gray-300">
                  {t('setupWizard.boxSelection.noBoxes')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Preferences */}
        {step === 5 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              {t('setupWizard.preferences.title')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('setupWizard.preferences.uiLanguage')}
                </label>
                <select
                  value={config.ui_language}
                  onChange={(e) => {
                    setConfig({ ...config, ui_language: e.target.value });
                    setLanguage(e.target.value);
                  }}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="en">{t('setupWizard.languages.en')}</option>
                  <option value="de">{t('setupWizard.languages.de')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('setupWizard.preferences.audioLanguage')}
                </label>
                <select
                  value={config.default_language}
                  onChange={(e) => setConfig({ ...config, default_language: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="de-de">Deutsch</option>
                  <option value="en-us">English (US)</option>
                  <option value="en-gb">English (UK)</option>
                  <option value="fr-fr">Français</option>
                </select>
              </div>

              <label className="flex items-center p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.auto_parse_taf}
                  onChange={(e) => setConfig({ ...config, auto_parse_taf: e.target.checked })}
                  className="mr-3"
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {t('setupWizard.preferences.autoParseTaf')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('setupWizard.preferences.autoParseTafDescription')}
                  </p>
                </div>
              </label>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                  {t('setupWizard.preferences.summary')}
                </h3>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• {t('setupWizard.preferences.teddycloud')}: {config.teddycloud_url}</li>
                  <li>• {t('setupWizard.preferences.images')}: {config.custom_img_path}</li>
                  {config.selected_box && (
                    <li>• {t('setupWizard.preferences.selectedBox')}: {boxes.find(b => b.id === config.selected_box)?.name}</li>
                  )}
                  <li>• {t('setupWizard.preferences.autoParseTaf')}: {config.auto_parse_taf
                    ? t('setupWizard.preferences.autoParseTafEnabled')
                    : t('setupWizard.preferences.autoParseTafDisabled')}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t dark:border-gray-700">
          <button
            onClick={prevStep}
            disabled={step === 0 || loading}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
          >
            {t('setupWizard.back')}
          </button>

          {step < 5 ? (
            <button
              onClick={nextStep}
              disabled={!canProceed() || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {t('setupWizard.next')}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? t('setupWizard.saving') : t('setupWizard.completeSetup')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
