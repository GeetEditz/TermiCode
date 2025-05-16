import { useState } from 'react';
import { Link } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
// @ts-ignore - Missing type declarations
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
// @ts-ignore - Missing type declarations
import toast from 'react-hot-toast';
import Terminal from './Terminal';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { executeCode } from '../services/api';

// Default Python code template
const DEFAULT_CODE = `# Write your Python code here
def main():
    name = input("What is your name? ")
    print(f"Hello, {name}!")
    
if __name__ == "__main__":
    main()
`;

// Add CodeExecutionResponse type definition to fix linter error
interface CodeExecutionResponse {
  output?: string;
  error?: string;
  waitingForInput?: boolean;
  inputPrompt?: string;
  sessionId?: string;
  executionTime?: number;
}

const CodeEditor = () => {
  const [code, setCode] = useLocalStorage('code-editor-code', DEFAULT_CODE);
  const [language, setLanguage] = useLocalStorage('code-editor-language', 'python');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [executionTime, setExecutionTime] = useState<number | undefined>(undefined);
  const [isExecuting, setIsExecuting] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleCodeChange = (value: string) => {
    setCode(value);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value);
  };

  const handleLanguageClick = () => {
    toast(
      <div className="flex items-start">
        <div className="h-10 w-1 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full mr-3 my-1"></div>
        <div className="flex flex-col">
          <div className="font-bold text-blue-400 flex items-center">
            <span>Update Coming</span>
            <span className="ml-2 text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/20">Soon</span>
          </div>
          <div className="text-sm mt-1 text-white/90">More languages will be added in future updates</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {['JavaScript', 'TypeScript', 'Java'].map((lang) => (
              <span key={lang} className="text-xs px-2 py-1 rounded-md bg-gradient-to-r from-gray-800/80 to-gray-700/80 text-blue-300 border border-blue-500/20">
                {lang}
              </span>
            ))}
            <span className="text-xs px-2 py-1 rounded-md bg-gradient-to-r from-gray-800/80 to-gray-700/80 text-blue-300 border border-blue-500/20">
              +more
            </span>
          </div>
        </div>
      </div>,
      {
        position: 'top-center',
        style: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4), 0 0 30px -10px rgba(59, 130, 246, 0.2) inset',
          padding: '16px',
          borderRadius: '10px',
        },
        duration: 4000,
      }
    );
  };

  const handleRunCode = async () => {
    setIsExecuting(true);
    setOutput('');
    setError(undefined);
    setExecutionTime(undefined);
    setWaitingForInput(false);
    setSessionId(null);

    const startTime = performance.now();
    
    try {
      const response = await executeCode({
        code,
        language,
        input: '',
      });
      const endTime = performance.now();
      const elapsed = Math.round(endTime - startTime);
      
      setExecutionTime(elapsed);
      
      if (response.error) {
        setError(response.error);
        setIsExecuting(false);
      } else {
        // Clean output from binary headers and control characters
        const cleanedOutput = response.output
          .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
          .replace(/\r\n/g, '\n')
          .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
          .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '')
          .replace(/\{"(stream|stdin|stdout|stderr|hijack|demux)":(true|false)(,"(stream|stdin|stdout|stderr|hijack|demux)":(true|false))*\}/g, '');
        
        setOutput(cleanedOutput);
        
        // Check if the code is waiting for input
        if (response.waitingForInput) {
          setWaitingForInput(true);
          
          // Clean input prompt of control characters
          const cleanedPrompt = response.inputPrompt 
            ? response.inputPrompt.replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
                .replace(/\r\n/g, '\n')
                .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
                .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '')
                .replace(/\{"(stream|stdin|stdout|stderr|hijack|demux)":(true|false)(,"(stream|stdin|stdout|stderr|hijack|demux)":(true|false))*\}/g, '')
            : '';
          
          setInputPrompt(cleanedPrompt);
          setSessionId(response.sessionId || null);
        } else {
          setIsExecuting(false);
          setSessionId(null);
        }
      }
    } catch (error) {
      setError('Failed to execute code. Please try again later.');
      setIsExecuting(false);
    }
  };

  const handleInput = async (input: string) => {
    if (!sessionId) {
      return;
    }
    
    try {
      // Update UI first to show we're processing input
      setWaitingForInput(false);
      
      // Add loading state while processing input
      setIsExecuting(true);
      
      // Update output to show the input
      const updatedOutput = `${output}${input}\n`;
      setOutput(updatedOutput);
      
      // Add a timeout handler for long-running operations
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Client timeout')), 25000);
      });
      
      // Race the API call against a timeout
      const response = await Promise.race([
        executeCode({
          sessionId,
          input: input,
        }),
        timeoutPromise
      ]) as CodeExecutionResponse;
      
      // Handle error in response
      if (response.error) {
        // If session not found, we should allow restarting
        if (response.error.includes('Session not found') || response.error.includes('expired')) {
          setError(`${response.error} Please run your code again.`);
          setSessionId(null);
        } else if (response.error.includes('timed out')) {
          // Special handling for timeout errors
          setOutput(prev => `${prev}Program execution is taking longer than expected. You can continue waiting or try again with different input.\n`);
          setError('Execution timed out. Your code might be waiting for more input or performing a long-running operation.');
          
          // Give user the option to retry or cancel
          const retry = window.confirm('Execution timed out. Would you like to keep waiting for output?');
          
          if (retry) {
            // Try to get any output that might be available now
            setError(undefined);
            setOutput(prev => `${prev}Continuing to wait for program output...\n`);
            
            // Maintain session state but remove waiting for input
            setIsExecuting(true);
            setWaitingForInput(false);
            
            // Make another request with empty input just to check status
            try {
              const retryResponse = await executeCode({
                sessionId,
                input: '',
              });
              
              if (retryResponse.error) {
                setError(retryResponse.error);
                setIsExecuting(false);
                setSessionId(null);
              } else {
                // Update with any output we got
                const cleanedOutput = retryResponse.output 
                  ? retryResponse.output.replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
                  : updatedOutput;
                
                setOutput(cleanedOutput);
                
                if (retryResponse.waitingForInput) {
                  setWaitingForInput(true);
                  
                  // Clean input prompt of control characters
                  const cleanedPrompt = retryResponse.inputPrompt 
                    ? retryResponse.inputPrompt.replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
                    : '';
                  
                  setInputPrompt(cleanedPrompt);
                } else {
                  setIsExecuting(false);
                  setSessionId(null);
                }
              }
            } catch (retryError) {
              setError('Failed to recover from timeout. Please run your code again.');
              setIsExecuting(false);
              setSessionId(null);
            }
            return;
          } else {
            // User chose to cancel
            setIsExecuting(false);
            setSessionId(null);
          }
        } else {
          setError(response.error);
          setIsExecuting(false);
        }
      } else {
        // Clean the new output from the server
        const newOutputFromServer = response.output
          ? response.output
              .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
              .replace(/\r\n/g, '\n')
              .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
              .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '')
              .replace(/\{"(stream|stdin|stdout|stderr|hijack|demux)":(true|false)(,"(stream|stdin|stdout|stderr|hijack|demux)":(true|false))*\}/g, '')
          : '';
          
        // IMPORTANT FIX: Append the new output to the existing output plus input
        // But don't duplicate prompts
        const lastLineOfCurrent = updatedOutput.split('\n').pop() || '';
        const firstLineOfNew = newOutputFromServer.split('\n')[0] || '';
        
        // Check if the first line of new output is already in our last line
        const newOutputWithoutDuplicates = lastLineOfCurrent.includes(firstLineOfNew) && firstLineOfNew.trim().length > 0
          ? newOutputFromServer.split('\n').slice(1).join('\n') // Skip first line if duplicate
          : newOutputFromServer;
          
        setOutput(prev => `${prev}${newOutputWithoutDuplicates}`);
        
        // Check if waiting for more input
        if (response.waitingForInput) {
          setWaitingForInput(true);
          
          // Clean input prompt of control characters
          const cleanedPrompt = response.inputPrompt 
            ? response.inputPrompt.replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
                .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
            : '';
            
          setInputPrompt(cleanedPrompt);
        } else {
          setIsExecuting(false);
          setSessionId(null);
          if (response.executionTime) {
            setExecutionTime(response.executionTime);
          }
        }
      }
    } catch (error) {
      // Handle client-side timeout specially
      if (error instanceof Error && error.message === 'Client timeout') {
        setOutput(prev => 
          `${prev}Error: Request timed out. The server might still be processing your input.\n` +
          `You can try running your code again with simpler input.\n`
        );
        setError('Client-side timeout. The request took too long to complete.');
      } else {
        // Show a more helpful error message in the output
        setOutput(prev => 
          `${prev}Error: Failed to process input. The execution might have timed out or the process was terminated.\n` +
          `You can try running your code again with a simpler input.\n`
        );
        setError('Failed to send input. The execution might have timed out.');
      }
      
      setIsExecuting(false);
      setSessionId(null);
    }
  };

  // Add a function to cancel execution
  const handleCancelExecution = () => {
    if (sessionId) {
      setIsExecuting(false);
      setWaitingForInput(false);
      setSessionId(null);
      setError('Execution cancelled by user');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 py-2 w-full">
      {/* Logo in top-left */}
      <div className="flex items-center mb-3">
        <Link to="/" className="flex items-center gap-2 text-blue-400 font-bold text-xl">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span>TermiCode</span>
        </Link>
      </div>
      
      <div className="bg-[#0d1117] rounded-lg shadow-2xl overflow-hidden transition-all duration-300 border border-gray-800 hover:shadow-[0_20px_50px_rgba(8,_112,_184,_0.35)]">
        {/* macOS style window header */}
        <div className="h-9 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center px-4 rounded-t-lg border-b border-gray-700 relative">
          <div className="flex space-x-2 absolute left-4">
            <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors duration-200 cursor-pointer"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors duration-200 cursor-pointer"></div>
            <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors duration-200 cursor-pointer"></div>
          </div>
          <div className="w-full text-center text-gray-400 text-xs font-mono">
            main.py - TermiCode
          </div>
        </div>

        {/* Editor toolbar - improved responsive layout */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 md:px-6 py-3 bg-[#161b22] border-b border-gray-800">
          <div className="flex items-center mb-2 sm:mb-0">
            <h1 className="text-lg md:text-xl font-bold text-gray-200">Python TermiCode</h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={language}
              onChange={handleLanguageChange}
              onClick={handleLanguageClick}
              className="px-2 md:px-3 py-1.5 bg-[#0d1117] backdrop-blur-sm border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
            >
              <option value="python">Python</option>
            </select>
            
            <button
              onClick={handleRunCode}
              disabled={isExecuting}
              className={`flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-md font-medium transition-all duration-200 ${
                isExecuting 
                  ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 text-white hover:shadow-lg hover:shadow-green-500/30 btn-glow'
              }`}
            >
              {isExecuting ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400/70 border-t-transparent rounded-full animate-spin"></div>
                  <span className="hidden sm:inline">Running...</span>
                  <span className="sm:hidden">Run</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden sm:inline">Run Code</span>
                  <span className="sm:hidden">Run</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        <div className="relative">
          <div className="code-container">
            <CodeMirror
              value={code}
              theme={vscodeDark}
              extensions={[python()]}
              onChange={handleCodeChange}
              height="450px"
              className="code-editor"
            />
          </div>
        </div>
      </div>
      
      <Terminal 
        output={output} 
        isLoading={isExecuting} 
        error={error} 
        executionTime={executionTime}
        onInput={handleInput}
        waitingForInput={waitingForInput}
        inputPrompt={inputPrompt} 
      />
      
      {/* Cancel execution button */}
      {isExecuting && (
        <div className="mt-4 text-right">
          <button 
            onClick={handleCancelExecution}
            className="text-sm text-red-500 hover:text-red-700 inline-flex items-center transition-colors duration-200"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Execution
          </button>
        </div>
      )}
    </div>
  );
};

export default CodeEditor; 