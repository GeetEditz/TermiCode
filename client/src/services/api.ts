import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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
    const response = await axios.post(`${API_URL}/execute`, data);
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