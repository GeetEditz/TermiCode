import { useRef, useEffect, useState, KeyboardEvent } from 'react';

type TerminalProps = {
  output: string;
  isLoading: boolean;
  error?: string;
  executionTime?: number;
  onInput?: (input: string) => void;
  waitingForInput: boolean;
  inputPrompt: string;
};

const Terminal = ({ 
  output, 
  isLoading, 
  error, 
  executionTime, 
  onInput, 
  waitingForInput,
  inputPrompt 
}: TerminalProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [currentInput, setCurrentInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  
  // Process input prompt first to avoid variable reference issues
  const cleanInputPrompt = inputPrompt
    .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '') || '> ';
  
  // Clean control characters and binary headers from output
  const cleanOutput = output
    .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '') // Remove more control characters
    .replace(/\\\\\\/g, '\\') // Remove extra backslashes
    // Filter out Docker configuration JSON data
    .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '')
    // Filter out any other Docker configuration JSON patterns
    .replace(/\{"(stream|stdin|stdout|stderr|hijack|demux)":(true|false)(,"(stream|stdin|stdout|stderr|hijack|demux)":(true|false))*\}/g, '')
    .trim(); // Trim extra whitespace
  
  // Check for duplicate prompts in output (must be after cleanInputPrompt definition)
  const lastLine = cleanOutput.split('\n').pop() || '';
  const promptAlreadyInOutput = cleanInputPrompt.trim() && lastLine.includes(cleanInputPrompt.trim());

  // Auto-scroll terminal to bottom when output changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
    
    // Debug output
    if (output && output.length > 0) {
      console.log("Terminal received output:", {
        rawLength: output.length,
        cleanLength: cleanOutput.length,
        rawPreview: output.substring(0, 50),
        cleanPreview: cleanOutput.substring(0, 50),
        isLoading,
        waitingForInput
      });
    }
    
    // Focus input when waiting for input
    if (waitingForInput && inputRef.current) {
      try {
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            // Position cursor at the end of the input
            const length = inputRef.current.value.length;
            inputRef.current.setSelectionRange(length, length);
          }
        }, 100); // Small delay to ensure DOM is ready
      } catch (e) {
        console.error('Error focusing input:', e);
      }
    }
  }, [output, error, waitingForInput, isLoading, cleanOutput]);

  // Keep focus on input when waiting for input
  useEffect(() => {
    if (waitingForInput) {
      // Set interval to check focus every 500ms
      const focusInterval = setInterval(() => {
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
          setIsFocused(true);
        }
      }, 500);
      
      return () => clearInterval(focusInterval);
    }
  }, [waitingForInput]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onInput) {
      e.preventDefault(); // Prevent default to ensure we handle the input
      if (currentInput.trim() || confirm('Send empty input?')) {
        onInput(currentInput);
        setCurrentInput('');
      }
    }
  };

  const focusInput = () => {
    if (waitingForInput && inputRef.current) {
      try {
        inputRef.current.focus();
        setIsFocused(true);
      } catch (e) {
        console.error('Error focusing input:', e);
      }
    }
  };

  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
        <div className="flex items-center">
          <h2 className="text-lg font-bold text-gray-200">Terminal Output</h2>
        </div>
        {executionTime !== undefined && !isLoading && !waitingForInput && (
          <span className="text-xs font-mono bg-gray-700 px-2 py-1 rounded-md text-gray-300 mt-1 sm:mt-0">
            Finished in {executionTime}ms
          </span>
        )}
      </div>
      
      <div 
        className="bg-[#0d1117] rounded-lg shadow-2xl overflow-hidden transition-all duration-300 border border-gray-800 hover:shadow-[0_20px_50px_rgba(8,_112,_184,_0.35)]"
      >
        {/* macOS style window header */}
        <div className="h-9 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center px-4 rounded-t-lg border-b border-gray-700 relative">
          <div className="flex space-x-2 absolute left-4">
            <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors duration-200 cursor-pointer"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors duration-200 cursor-pointer"></div>
            <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors duration-200 cursor-pointer"></div>
          </div>
          <div className="w-full text-center text-gray-400 text-xs font-mono">
            terminal@python
          </div>
        </div>
        
        <div 
          ref={terminalRef}
          className="terminal relative font-mono text-sm h-60 md:h-80 overflow-auto scrollbar-hidden p-4"
          onClick={focusInput}
          tabIndex={waitingForInput ? -1 : 0}
        >
          {isLoading && !waitingForInput ? (
            <div className="flex items-center text-green-400">
              <div className="mr-2 h-4 w-4 rounded-full border-2 border-t-transparent border-green-400 animate-spin"></div>
              <span>Running code...</span>
            </div>
          ) : error ? (
            <div className="text-red-400 whitespace-pre-wrap border-l-2 border-red-500 pl-3 my-2">{error}</div>
          ) : cleanOutput || waitingForInput ? (
            <div className="whitespace-pre-wrap text-green-400">
              {/* Always show output, even if empty */}
              {cleanOutput}
              {waitingForInput && (
                <div className={`flex items-center mt-1 ${isFocused ? 'bg-gray-800' : ''} transition-colors duration-200 rounded`}>
                  {/* Only show the prompt if it's not already in the output to avoid duplication */}
                  {!promptAlreadyInOutput && (
                    <span className="mr-2 text-green-500 font-bold">{cleanInputPrompt}</span>
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className="bg-transparent border-none outline-none w-full caret-green-500 text-green-400 font-mono"
                    autoFocus
                    aria-label="Input for code execution"
                    placeholder="Type here..."
                  />
                  <div className={`w-2 h-5 ${isFocused ? 'bg-green-500' : 'bg-transparent'} animate-pulse`}></div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 italic">Run your code to see output here</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Terminal; 