import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Docker from 'dockerode';
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const docker = new Docker();

// Middleware
app.use(cors({
  origin: ['https://code-editor-client-production.up.railway.app', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// In-memory storage for active code execution sessions
const activeSessions = new Map();

// Create a temporary directory for code execution
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// At the top of the file, add a debug logging utility
const DEBUG = true;

function debugLog(...args) {
  if (DEBUG) {
    console.log(`[DEBUG ${new Date().toISOString()}]`, ...args);
  }
}

function errorLog(context, error) {
  console.error(`[ERROR ${new Date().toISOString()}] ${context}:`, error);
  console.error(`Stack trace: ${error.stack || 'No stack trace available'}`);
}

// Execute code using Docker with interactive input support
app.post('/api/execute', async (req, res) => {
  debugLog('Received execute request', { 
    hasCode: !!req.body.code, 
    language: req.body.language, 
    hasInput: req.body.input !== undefined,
    sessionId: req.body.sessionId 
  });
  
  try {
    const { code, language, input, sessionId } = req.body;

    // Handle input for existing session
    if (sessionId) {
      debugLog('Processing input for session', { sessionId, inputLength: input?.length });
      const session = activeSessions.get(sessionId);
      if (!session) {
        debugLog('Session not found', { sessionId });
        return res.status(404).json({ 
          error: 'Session not found or expired. Please run your code again.' 
        });
      }
      
      try {
        // Send input to the container
        if (session.stream && input !== undefined) {
          debugLog('Sending input to container', { input, sessionId });
          
          // Append input to current output to preserve history
          const currentOutput = session.stdoutChunks.map(chunk => chunk.toString()).join('');
          debugLog('Current output before input', { 
            outputLength: currentOutput.length,
            outputPreview: currentOutput.substring(0, 50) + (currentOutput.length > 50 ? '...' : '') 
          });
          
          // Write input + newline to the container
          session.stream.write(input + '\n');
          
          // Wait for output with increased timeout and more robust handling
          debugLog('Waiting for output after input');
          const result = await waitForInputResult(session);
          
          // Clean output for better display
          if (result.output) {
            const originalOutput = result.output;
            result.output = result.output
              .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
              .replace(/\r\n/g, '\n')
              .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
              // Filter out Docker configuration data
              .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '');
            
            debugLog('Cleaned output for response', {
              originalLength: originalOutput.length,
              cleanedLength: result.output.length
            });
          }
          
          debugLog('Received output after input', { 
            outputLength: result.output.length,
            outputPreview: result.output.substring(0, 100) + (result.output.length > 100 ? '...' : '')
          });
          
          // Check if we're waiting for more input by detecting common input patterns
          const waitingForInput = isWaitingForInput(result.output);
          
          // If waiting for input, extract the prompt
          const inputPrompt = waitingForInput ? extractInputPrompt(result.output) : '';
          
          debugLog('Input processing complete', { waitingForInput, hasPrompt: !!inputPrompt });
          return res.json({
            output: result.output,
            waitingForInput,
            inputPrompt,
            sessionId
          });
        } else {
          debugLog('Invalid stream or input', { hasStream: !!session.stream, inputDefined: input !== undefined });
        }
      } catch (error) {
        errorLog(`Error processing input for session ${sessionId}`, error);
        // Clean up session on error
        cleanupSession(sessionId);
        return res.json({ 
          error: 'Error processing input: ' + error.message,
          waitingForInput: false 
        });
      }
      
      debugLog('Invalid session request', { sessionId });
      return res.status(400).json({ error: 'Invalid session request' });
    }

    // Start a new execution session
    debugLog('Starting new execution session', { language, codeLength: code?.length });
    if (!code) {
      return res.status(400).json({ error: 'No code provided' });
    }

    if (language !== 'python') {
      return res.status(400).json({ error: 'Unsupported language. Currently only Python is supported.' });
    }

    const fileId = uuidv4();
    const filePath = path.join(tempDir, `${fileId}.py`);
    debugLog('Generated file info', { fileId, filePath });

    // Write code to file
    try {
      fs.writeFileSync(filePath, code);
      debugLog('Code written to file successfully');
    } catch (fsError) {
      errorLog('Error writing code to file', fsError);
      return res.status(500).json({ error: 'Failed to save code to file' });
    }
    
    // Absolute path for mounting in container
    const hostCodePath = path.resolve(filePath);
    
    // Create a new session ID
    const newSessionId = uuidv4();
    debugLog('Created new session ID', { newSessionId });

    try {
      // Create the Docker container for interactive execution
      debugLog('Creating Docker container');
      const container = await docker.createContainer({
        Image: 'code-editor-app',  // Updated Docker image name to match docker-compose service
        Cmd: ['/app/venv/bin/python', '/code/script.py'],  // Use the Python from our virtual environment
        HostConfig: {
          Binds: [
            `${hostCodePath}:/code/script.py:ro`
          ],
          NetworkMode: 'none', // Isolate the container
          Memory: 100 * 1024 * 1024, // 100MB memory limit
          MemorySwap: 100 * 1024 * 1024, // 100MB memory + swap limit
          CpuPeriod: 100000, // CPU quota in microseconds
          CpuQuota: 50000, // 50% CPU limit
          PidsLimit: 50, // Limit number of processes
        },
        Tty: false, // Explicitly disable TTY mode for raw output
        OpenStdin: true,
        StdinOnce: false, // Keep stdin open
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: true,
      });
      debugLog('Container created', { containerId: container.id });

      debugLog('Starting container');
      await container.start();
      debugLog('Container started successfully');

      // Attach to the container for interactive I/O
      debugLog('Attaching to container');
      const stream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
        demux: true // Separate stdout and stderr streams
      });
      debugLog('Successfully attached to container stream');

      // Set up data collection
      let stdoutChunks = [];
      let stderrChunks = [];
      let currentOutput = '';
      
      // Set session timeout
      debugLog('Setting session timeout');
      const sessionTimeout = setTimeout(() => {
        debugLog('Session timeout reached, cleaning up', { sessionId: newSessionId });
        cleanupSession(newSessionId);
      }, 300000); // 5 minutes max session time
      
      // Store session data
      activeSessions.set(newSessionId, {
        container,
        stream,
        stdoutChunks,
        stderrChunks,
        createdAt: Date.now(),
        timeout: sessionTimeout
      });
      debugLog('Session data stored', { sessionId: newSessionId });
      
      // Add explicit logs for stream data events
      let dataCount = 0;
      
      // Handle demultiplexed stdout and stderr streams
      stream.on('data', (chunk, type) => {
        dataCount++;
        
        if (type === 'stdout') {
          const chunkStr = chunk.toString();
          // Clean control characters for better handling
          const cleanChunk = chunkStr.replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
                                    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
                                    // Filter out Docker configuration JSON that might leak into output
                                    .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '');
          
          // Store both cleaned chunks for output and session tracking
          stdoutChunks.push(Buffer.from(cleanChunk));
          currentOutput += cleanChunk;
          
          debugLog('Received stdout from container', { 
            dataCount,
            chunkLength: chunkStr.length,
            cleanedLength: cleanChunk.length,
            totalLength: currentOutput.length,
            chunkPreview: cleanChunk.substring(0, 50) + (cleanChunk.length > 50 ? '...' : '')
          });
        } else if (type === 'stderr') {
          stderrChunks.push(chunk);
          const chunkStr = chunk.toString();
          debugLog('Received stderr from container', {
            dataCount,
            chunkLength: chunkStr.length,
            chunkPreview: chunkStr.substring(0, 50) + (chunkStr.length > 50 ? '...' : '')
          });
        } else {
          // For non-demuxed data (fallback)
          const chunkStr = chunk.toString();
          // Clean control characters for better handling
          const cleanChunk = chunkStr.replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
                                    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
                                    // Filter out Docker configuration JSON that might leak into output
                                    .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '');
          
          // Store both cleaned chunks for output and session tracking
          stdoutChunks.push(Buffer.from(cleanChunk));
          currentOutput += cleanChunk;
          
          debugLog('Received data from container', { 
            dataCount,
            chunkLength: chunkStr.length,
            cleanedLength: cleanChunk.length,
            totalLength: currentOutput.length,
            chunkPreview: cleanChunk.substring(0, 50) + (cleanChunk.length > 50 ? '...' : ''),
            chunkHex: chunkStr.slice(0, 20).split('').map(c => c.charCodeAt(0).toString(16)).join(' ')
          });
        }
      });
      
      // Add explicit error handling for the stream
      stream.on('error', (err) => {
        errorLog('Container stream error', err);
      });
      
      // Add explicit end handler
      stream.on('end', () => {
        debugLog('Container stream ended', { sessionId: newSessionId, dataCount });
      });
      
      // Wait for initial output to see if it's waiting for input
      debugLog('Waiting for initial output');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if program is waiting for input by detecting common input patterns
      const waitingForInput = isWaitingForInput(currentOutput);
      
      // Extract the input prompt if waiting for input
      const inputPrompt = waitingForInput ? extractInputPrompt(currentOutput) : '';
      
      // Clean up the output string for client
      const cleanedOutput = currentOutput
        .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
        // Filter out Docker configuration data
        .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '');
      
      debugLog('Initial execution complete', { 
        outputLength: cleanedOutput.length,
        waitingForInput,
        inputPrompt,
        rawOutput: currentOutput.substring(0, 50),
        cleanedOutput: cleanedOutput.substring(0, 50)
      });
      
      return res.json({
        output: cleanedOutput,
        sessionId: newSessionId,
        waitingForInput,
        inputPrompt
      });
    } catch (err) {
      // Clean up on error
      errorLog('Error during container execution', err);
      cleanupSession(newSessionId);
      
      try {
        fs.unlinkSync(filePath);
        debugLog('Temporary file removed', { filePath });
      } catch (cleanupErr) {
        errorLog('Error removing temporary file', cleanupErr);
      }
      
      return res.json({ 
        error: err.message || 'An error occurred during execution',
        output: ''
      });
    }
  } catch (error) {
    errorLog('Unexpected error in execute endpoint', error);
    return res.status(500).json({ error: 'Failed to execute code: ' + error.message });
  }
});

// Helper function to determine if output is waiting for input
function isWaitingForInput(output) {
  if (!output) return false;
  
  // Clean up the output for checking
  const cleanOutput = output.replace(/\r/g, '').replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '');
  const lines = cleanOutput.split('\n');
  const lastNonEmptyLine = lines.filter(line => line.trim().length > 0).pop() || '';
  
  // Debug
  debugLog('Checking if waiting for input - last non-empty line:', lastNonEmptyLine);
  
  // Check for common input patterns
  // 1. Explicit input prompts ending with ? or :
  const hasQuestionPrompt = /[\w\s]+\?(?:\s*)$/.test(lastNonEmptyLine);
  const hasColonPrompt = /[\w\s]+:(?:\s*)$/.test(lastNonEmptyLine);
  
  // 2. Check for Python input() function behavior - very common patterns
  const commonInputPatterns = [
    /Enter/i, /Input/i, /Type/i, /Name/i, /ID/i, /Age/i, 
    /Number/i, /Value/i, /choice/i, /select/i, /provide/i,
    /password/i, /username/i, /email/i, /address/i, /phone/i,
    /continue/i, /proceed/i, /option/i, /answer/i, /response/i
  ];
  
  const hasInputKeyword = commonInputPatterns.some(pattern => 
    pattern.test(lastNonEmptyLine)
  );
  
  // 3. Look for classic prompt characters
  const endsWithPromptChar = /(?:>|\$|:|») ?$/.test(lastNonEmptyLine);
  
  // 4. Check if output is not "complete" - no final newline or ends with prompt-like characters
  const hasStalled = lastNonEmptyLine.length > 0 && !cleanOutput.endsWith('\n\n');
  
  // 5. Check if the output is very short - could be just a prompt
  const isShortOutput = cleanOutput.length < 100 && cleanOutput.split('\n').length <= 3;
  
  const result = hasQuestionPrompt || hasColonPrompt || hasInputKeyword || endsWithPromptChar || 
                (hasStalled && (isShortOutput || hasInputKeyword));
  
  // Debug logging
  debugLog('Input detection:', {
    hasQuestionPrompt,
    hasColonPrompt,
    hasInputKeyword,
    endsWithPromptChar,
    hasStalled,
    isShortOutput,
    result
  });
  
  return result;
}

// Helper function to extract the input prompt from output
function extractInputPrompt(output) {
  if (!output) return '';
  
  // Clean up the output
  const cleanOutput = output
    .replace(/\r/g, '')
    .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');
    
  const lines = cleanOutput.split('\n');
  
  // Get the last non-empty line as the prompt
  const lastNonEmptyLine = lines.filter(line => line.trim().length > 0).pop() || '';
  
  // If it's too long, try to extract just the prompt part
  if (lastNonEmptyLine.length > 50) {
    // Try to extract just the question/prompt part
    const promptMatch = lastNonEmptyLine.match(/([^.!?:]+[?:])\s*$/);
    if (promptMatch) {
      return promptMatch[1].trim();
    }
  }
  
  return lastNonEmptyLine;
}

// New function to clean output comprehensively
function cleanDockerOutput(output) {
  return output
    .replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
    // Filter out Docker configuration JSON data that leaks into output
    .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '')
    // Filter out any JSON-like Docker config objects that might appear
    .replace(/\{"(stream|stdin|stdout|stderr|hijack|demux)":(true|false)(,"(stream|stdin|stdout|stderr|hijack|demux)":(true|false))*\}/g, '');
}

// Helper function to wait for output from a running container
async function waitForOutput(session, timeoutMs = 15000) {
  debugLog('Waiting for output from container', { timeoutMs });
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const timeout = setTimeout(() => {
      const duration = Date.now() - startTime;
      debugLog('Output wait timeout reached', { duration, timeoutMs });
      
      // Instead of rejecting with an error, try to check if we can gracefully return any output
      try {
        // Check if there's any output to return even if we timed out
        const existingOutput = session.stdoutChunks.map(chunk => chunk.toString()).join('');
        
        if (existingOutput) {
          debugLog('Timeout reached but returning existing output', { 
            outputLength: existingOutput.length
          });
          
          cleanup();
          resolve({ output: existingOutput });
        } else {
          // If no output at all, check if Python process is still running
          session.container.inspect().then((info) => {
            if (info.State.Running) {
              // Container is running but no output - likely a blocking or slow operation
              debugLog('Container running but no output after timeout', { state: info.State });
              cleanup();
              resolve({ output: 'Program is running but not producing output. It may be performing a long calculation or waiting for more input.' });
            } else {
              // Container exited with no output
              debugLog('Container exited with no visible output', { 
                exitCode: info.State.ExitCode,
                status: info.State.Status
              });
              cleanup();
              
              if (info.State.ExitCode === 0) {
                resolve({ output: 'Program completed successfully but produced no output.' });
              } else {
                reject(new Error(`Program exited with code ${info.State.ExitCode}`));
              }
            }
          }).catch(err => {
            errorLog('Error checking container status during timeout', err);
            cleanup();
            reject(new Error('Execution timed out and failed to check program status.'));
          });
        }
      } catch (err) {
        errorLog('Error handling timeout gracefully', err);
        cleanup();
        reject(new Error('Execution timed out. Your code took too long to respond.'));
      }
    }, timeoutMs);
    
    let output = '';
    let quietTimer = null;
    let lastDataTime = Date.now();
    let dataReceived = false;
    
    const dataHandler = (chunk) => {
      dataReceived = true;
      const chunkStr = chunk.toString();
      
      // Remove binary header if present (common with Docker output streams)
      // The first 8 bytes can be a header in the Docker API
      const cleanChunk = chunkStr.replace(/^\u0001\u0000\u0000\u0000\u0000\u0000\u0000[\u0000-\uffff]/g, '')
                                .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
                                // Filter out Docker configuration JSON that might leak into output
                                .replace(/\{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true,"demux":true\}/g, '');
      
      // IMPORTANT FIX: Store both the cleaned chunk for output and raw chunk for session
      output += cleanChunk;
      session.stdoutChunks.push(Buffer.from(cleanChunk)); // Store cleaned chunk in session
      lastDataTime = Date.now();
      
      debugLog('Received data chunk while waiting', { 
        chunkLength: chunkStr.length,
        cleanChunkLength: cleanChunk.length,
        totalOutputLength: output.length,
        timeSinceStart: Date.now() - startTime,
        chunkHexStart: chunkStr.slice(0, 20).split('').map(c => c.charCodeAt(0).toString(16)).join(' ')
      });
      
      // Clear any existing quiet timer
      if (quietTimer) {
        clearTimeout(quietTimer);
        debugLog('Cleared previous quiet timer');
      }
      
      // Use the comprehensive cleaning function
      if (output) {
        output = cleanDockerOutput(output);
      }
      
      // Check if this output is waiting for input
      const waitingForInput = isWaitingForInput(output);
      if (waitingForInput) {
        debugLog('Output indicates waiting for input, resolving immediately');
        cleanup();
        resolve({ output });
        return;
      }
      
      // Set a new quiet timer - if no data for 500ms, consider it done
      quietTimer = setTimeout(() => {
        const quietTime = Date.now() - lastDataTime;
        debugLog('No new data received for a while', { quietTime });
        
        // Only resolve if we've received some output or we've waited long enough
        if (output || Date.now() - lastDataTime > 2000) {
          debugLog('Resolving output wait', { 
            outputLength: output.length,
            timeSinceLastData: Date.now() - lastDataTime,
            totalDuration: Date.now() - startTime
          });
          cleanup();
          resolve({ output });
        }
      }, 500);
    };
    
    // Handle receiving data
    session.stream.on('data', dataHandler);
    
    // Also handle errors on the stream
    const errorHandler = (err) => {
      errorLog('Stream error while waiting for output', err);
      cleanup();
      reject(err);
    };
    
    session.stream.on('error', errorHandler);
    
    // Clean up event listeners
    const cleanup = () => {
      clearTimeout(timeout);
      if (quietTimer) clearTimeout(quietTimer);
      session.stream.removeListener('data', dataHandler);
      session.stream.removeListener('error', errorHandler);
      debugLog('Cleaned up waitForOutput listeners');
    };
    
    // If no data received after some time, check if process has exited normally
    setTimeout(() => {
      if (!dataReceived) {
        debugLog('No data received within initial wait period, checking container status');
        
        // Try to get container info to see if it's still running
        session.container.inspect().then((info) => {
          debugLog('Container status', { 
            running: info.State.Running, 
            status: info.State.Status,
            exitCode: info.State.ExitCode 
          });
          
          // If container has exited with code 0, program completed successfully
          if (!info.State.Running && info.State.ExitCode === 0) {
            debugLog('Container exited successfully, program may have completed');
            // Return any existing output we have stored in session
            const existingOutput = session.stdoutChunks.map(chunk => chunk.toString()).join('');
            cleanup();
            resolve({ output: existingOutput || 'Program completed.' });
          } else {
            // Otherwise, keep waiting (container might be processing)
            debugLog('Container still processing or waiting for input');
            // Check if we have prior output that indicates waiting for input
            const priorOutput = session.stdoutChunks.map(chunk => chunk.toString()).join('');
            if (isWaitingForInput(priorOutput)) {
              debugLog('Prior output indicates waiting for input', { priorOutput: priorOutput.slice(-50) });
              cleanup();
              resolve({ output: priorOutput });
            }
          }
        }).catch(err => {
          errorLog('Error checking container status', err);
          cleanup();
          resolve({ output: 'Unable to determine program status.' });
        });
      }
    }, 5000);
  });
}

// New function to handle input results with more robust error handling
async function waitForInputResult(session, timeoutMs = 20000) {
  debugLog('Waiting for input result with extended timeout', { timeoutMs });
  
  try {
    // First try the normal waitForOutput with extended timeout
    const result = await waitForOutput(session, timeoutMs);
    
    // Clean the output before returning
    if (result.output) {
      const originalOutput = result.output;
      result.output = cleanDockerOutput(result.output);
      
      debugLog('Cleaned output in waitForInputResult', { 
        originalLength: originalOutput.length,
        cleanedLength: result.output.length,
        originalPreview: originalOutput.substring(0, 50),
        cleanedPreview: result.output.substring(0, 50)
      });
    }
    
    return result;
  } catch (error) {
    // If that fails, run a more aggressive check on the container
    debugLog('Initial input wait failed, checking container logs', { error: error.message });
    
    try {
      // Get container logs directly as a fallback
      const logs = await session.container.logs({
        stdout: true,
        stderr: true,
        follow: false,
        since: Math.floor((Date.now() - 30000) / 1000) // Last 30 seconds
      });
      
      // Process the logs to get output
      let output = logs.toString('utf8');
      output = cleanDockerOutput(output);
      
      debugLog('Retrieved container logs directly', { outputLength: output.length });
      
      return { output };
    } catch (logsError) {
      errorLog('Failed to retrieve container logs', logsError);
      throw error; // Throw the original error
    }
  }
}

// Helper function to clean up session
function cleanupSession(sessionId) {
  debugLog('Cleaning up session', { sessionId });
  const session = activeSessions.get(sessionId);
  if (session) {
    clearTimeout(session.timeout);
    try {
      if (session.container) {
        // Force stop and remove container to ensure proper cleanup
        debugLog('Stopping container for session', { sessionId });
        session.container.stop()
          .then(() => {
            debugLog('Container stopped successfully', { sessionId });
            return session.container.remove({ force: true });
          })
          .then(() => {
            debugLog('Container removed successfully', { sessionId });
          })
          .catch((err) => {
            errorLog('Error cleaning up container', err);
            // Try force removal as fallback
            session.container.remove({ force: true }).catch(() => {});
          });
      }
    } catch (err) {
      errorLog('Error cleaning up container:', err);
      try {
        // Force remove as a last resort
        session.container.remove({ force: true }).catch(() => {});
      } catch (finalErr) {
        errorLog('Final error removing container:', finalErr);
      }
    }
    activeSessions.delete(sessionId);
    debugLog('Session removed from active sessions', { sessionId });
  }
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    // Sessions older than 5 minutes should be cleaned up
    if (now - session.createdAt > 5 * 60 * 1000) {
      cleanupSession(sessionId);
    }
  }
}, 60 * 1000); // Check every minute

// Clean up on server shutdown
process.on('SIGINT', () => {
  console.log('Cleaning up active sessions before shutdown...');
  for (const [sessionId] of activeSessions.entries()) {
    cleanupSession(sessionId);
  }
  process.exit(0);
});

// Serve static files if in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 