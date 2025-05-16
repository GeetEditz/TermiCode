import { useState } from 'react';

type InputFieldProps = {
  input: string;
  setInput: (value: string) => void;
  isExecuting: boolean;
};

const InputField = ({ input, setInput, isExecuting }: InputFieldProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Input (stdin)</h2>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-gray-500 hover:text-accent dark:text-gray-400 dark:hover:text-accent"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="For programs that use input(), enter values here (one per line). Example:\nJohn\n12345"
        className={`w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-primary p-3 text-sm font-mono transition-all focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent ${
          isExpanded ? 'h-40' : 'h-20'
        }`}
        disabled={isExecuting}
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        <strong>Important:</strong> If your code uses input(), you must provide values here (one value per line), or you'll get an EOFError.
      </p>
    </div>
  );
};

export default InputField; 