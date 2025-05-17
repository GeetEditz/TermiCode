import axios from 'axios';

// Use the environment variable with proper path construction
const API_URL = import.meta.env.VITE_API_URL || '';
const API_PATH = '/api';

export type CodeExecutionRequest = {
  code?: string;
  language?: string;
  input?: string;
  sessionId?: string;
};

export type CodeExecutionResponse = {
  output: string;
  error?: string;
  executionTime?: number;
  waitingForInput?: boolean;
  inputPrompt?: string;
  sessionId?: string;
};

export const executeCode = async (
  data: CodeExecutionRequest
): Promise<CodeExecutionResponse> => {
  try {
    // Construct the URL properly based on whether we have a base URL
    const url = API_URL ? `${API_URL}${API_PATH}/execute` : `${API_PATH}/execute`;
    const response = await axios.post(url, data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    return {
      output: '',
      error: 'Failed to execute code. Please try again later.',
    };
  }
}; 