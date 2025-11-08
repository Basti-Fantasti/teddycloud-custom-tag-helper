import { useState, useEffect } from 'react'
import { TranslationProvider } from './context/TranslationContext'
import { TAFLibraryProvider } from './context/TAFLibraryContext'
import Dashboard from './pages/Dashboard'
import SetupWizard from './components/SetupWizard'
import { setupAPI } from './api/client'

function App() {
  const [setupRequired, setSetupRequired] = useState(null) // null = checking, true = show wizard, false = show dashboard
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const response = await setupAPI.checkStatus()
      setSetupRequired(response.data.setup_required)
    } catch (error) {
      console.error('Failed to check setup status:', error)
      // If check fails, assume setup is needed
      setSetupRequired(true)
    }
    setChecking(false)
  }

  const handleSetupComplete = () => {
    // Reload the page to reinitialize with new config
    window.location.reload()
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (setupRequired) {
    return (
      <TranslationProvider>
        <SetupWizard onComplete={handleSetupComplete} />
      </TranslationProvider>
    )
  }

  return (
    <TranslationProvider>
      <TAFLibraryProvider>
        <div className="min-h-screen bg-gray-100">
          <Dashboard />
        </div>
      </TAFLibraryProvider>
    </TranslationProvider>
  )
}

export default App
