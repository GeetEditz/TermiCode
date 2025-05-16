import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import CodeEditor from './components/CodeEditor';

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-900">
        <main className="container-fluid py-4 px-2 md:px-4 lg:px-6 max-w-screen-2xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<CodeEditor />} />
          </Routes>
        </main>
        <footer className="py-4 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} TermiCode. All rights reserved.</p>
        </footer>
        <Toaster
          position="top-center"
          toastOptions={{
            className: '',
            style: {
              background: 'rgba(17, 24, 39, 0.95)',
              color: '#fff',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              backdropFilter: 'blur(8px)',
              padding: '12px 20px',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.3)',
              fontWeight: '500',
              maxWidth: '380px',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#FFFFFF',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#FFFFFF',
              },
            },
            duration: 3000,
          }}
        />
      </div>
    </Router>
  );
}

export default App; 