"use client";

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { Renderer } from '../../renderer/renderer';
import { Scene } from '../../scene';
import { useProfanityChecker } from 'glin-profanity';
import Popup from '../../components/Popup';

// Helper func to format the raw WebGL renderer string into a cleaner, more readable name.
// since webgpu doesnt give all the info
const formatGpuName = (rawName: string): string => {
  if (!rawName) {
    return 'Unknown GPU';
  }

  // Case 1: Handle Apple M-series chips from ANGLE renderer string
  // Input: "ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)"
  // Output: "Apple M3 Pro"
  let match = rawName.match(/ANGLE Metal Renderer:\s*([^,]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Case 2: Handle NVIDIA, AMD, or other GPUs from ANGLE on Windows/Linux
  // Input: "ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04)...)"
  // Output: "NVIDIA GeForce RTX 5070"
  match = rawName.match(/ANGLE \([^,]+, ([^,(]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // If no specific formatting rule applies, return the original name.
  return rawName;
};

// Helper function to get detailed GPU information using the WebGL renderer string.
const getGpuName = (): string => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      return 'Unknown GPU (WebGL not supported)';
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    let rawRenderer = 'Unknown';
    
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (typeof renderer === 'string') {
        rawRenderer = renderer;
      }
    } else {
      // Fallback for browsers that don't support the debug extension
      const renderer = gl.getParameter(gl.RENDERER);
      if (typeof renderer === 'string') {
        rawRenderer = renderer;
      }
    }

    return formatGpuName(rawRenderer);

  } catch (e) {
    console.error('WebGL GPU detection error:', e);
    return 'Unknown GPU (detection error)';
  }
};

enum BenchmarkState {
  READY,
  RUNNING,
  COMPLETED,
  ERROR
}

export default function RunPage() {
  const [gpuInfo, setGpuInfo] = useState({ description: 'Detecting...', device: '' });
  const [device, setDevice] = useState<GPUDevice | null>(null);
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>(BenchmarkState.READY);
  const [benchmarkScore, setBenchmarkScore] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 800, height: 600 });
  const [averageFps, setAverageFps] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Profanity checker for the username input
  const { result: profanityResult, checkText: checkProfanity } = useProfanityChecker({
    allLanguages: true,
    autoReplace: false,
  });

  // Effect to validate username whenever it changes
  useEffect(() => {
    const handler = setTimeout(() => {
      if (username) {
        checkProfanity(username);
      }
    }, 300); // 300ms delay

    return () => {
      clearTimeout(handler);
    };
  }, [username, checkProfanity]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const benchmarkStartTimeRef = useRef<number | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const benchmarkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Benchmark duration in milliseconds (15 seconds)
  const BENCHMARK_DURATION_MS = 15000;
  // Number of frames to render for each benchmark measurement (reduced a lil to prevent browser freezing)
  const FRAMES_PER_MEASUREMENT = 3;
  // Interval between benchmark measurements in milliseconds (increased to give browser lil breathing room)
  const BENCHMARK_INTERVAL_MS = 2000;
  
  useEffect(() => {
    initGPU();
    
    // Set up canvas sizing
    const resizeCanvas = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        if (container) {
          const width = container.clientWidth;
          // Maintain 16:9 aspect ratio
          const height = Math.floor(width * 9 / 16);
          
          setCanvasDimensions({ width, height });
          
          // Set actual canvas pixel dimensions
          canvasRef.current.width = width;
          canvasRef.current.height = height;
          
          console.log('Canvas resized:', width, 'x', height);
        }
      }
    };
    
    // Initial sizing
    resizeCanvas();
    
    window.addEventListener('resize', resizeCanvas);
    
    // Cleanup function to stop rendering when component unmounts
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      
      // cleaning up all resources
      if (benchmarkIntervalRef.current) {
        clearInterval(benchmarkIntervalRef.current);
        benchmarkIntervalRef.current = null;
      }
      
      cleanupRenderer();
    };
  }, []);

  const initGPU = async () => {
    // Get detailed GPU name from WebGL instead of webGPU
    const webglGpuName = getGpuName();

    if (!navigator.gpu) {
      console.error("WebGPU could not be initialized. navigator.gpu is not defined.");
      // Even if WebGPU isn't supported, we can still show the WebGL GPU name.
      setGpuInfo({ description: webglGpuName, device: 'WebGPU Not Supported' });
      return;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });
      if (!adapter) {
        console.error("WebGPU could not be initialized. requestAdapter() returned null.");
        setGpuInfo({ description: webglGpuName, device: 'GPU Adapter Not Available' });
        return;
      }
      const gpuDevice = await adapter.requestDevice();
      
      setGpuInfo({ description: webglGpuName, device: '' });
      setDevice(gpuDevice);

    } catch (error) {
      console.error("Error initializing WebGPU:", error);
      setGpuInfo({ description: webglGpuName, device: 'Error Initializing WebGPU' });
    }
  }

  const handleBeginClick = () => {
    if (benchmarkState === BenchmarkState.READY && device) {
      // Start the benchmark using the force render test functionality
      console.log('Starting benchmark with force render test...');
      setBenchmarkState(BenchmarkState.RUNNING);
      benchmarkStartTimeRef.current = performance.now();
      frameTimesRef.current = [];
      
      // Create a new scene and renderer if needed
      if (!rendererRef.current && canvasRef.current) {
        const scene = new Scene();
        const renderer = new Renderer(canvasRef.current, scene);
        rendererRef.current = renderer;
        
        renderer.initialize().then(() => {
          console.log('Renderer initialized, starting benchmark interval');
          startBenchmarkInterval();
        }).catch(error => {
          console.error('Error initializing renderer:', error);
          setBenchmarkState(BenchmarkState.ERROR);
        });
      } else {
        // Use existing renderer
        startBenchmarkInterval();
      }
    }
  };
  
  const startBenchmarkInterval = () => {
    // Clear any existing interval
    if (benchmarkIntervalRef.current) {
      clearInterval(benchmarkIntervalRef.current);
    }
    
    // Set up interval to repeatedly render test frames
    benchmarkIntervalRef.current = setInterval(() => {
      const now = performance.now();
      const startTime = benchmarkStartTimeRef.current || now;
      const elapsed = now - startTime;
      
      // Update elapsed time display
      setElapsedTime(Math.min(elapsed, BENCHMARK_DURATION_MS));
      
      // Check if benchmark should end
      if (elapsed >= BENCHMARK_DURATION_MS) {
        finishBenchmark();
        return;
      }
      
      // Render multiple frames per interval to increase GPU load using forceRenderTest
      let totalFrameTime = 0;
      
      for (let i = 0; i < FRAMES_PER_MEASUREMENT; i++) {
        // Use the forceRenderTest function which already has the logic to render a frame
        forceRenderTest();
        
        // Get the frame time from the renderer if available
        if (rendererRef.current) {
          totalFrameTime += rendererRef.current.frametime;
        }
      }
      
      // Store average frame time for this measurement
      if (rendererRef.current) {
        frameTimesRef.current.push(totalFrameTime / FRAMES_PER_MEASUREMENT);
      }
    }, BENCHMARK_INTERVAL_MS);
  };

  const finishBenchmark = () => {
    // Clear the benchmark interval
    if (benchmarkIntervalRef.current) {
      clearInterval(benchmarkIntervalRef.current);
      benchmarkIntervalRef.current = null;
    }
    
    cleanupRenderer();

    // Calculate score from frame times
    if (frameTimesRef.current.length > 0) {
      // Calculate and log stats for debugging
      const sortedTimes = [...frameTimesRef.current].sort((a, b) => a - b);
      const minFrameTime = sortedTimes[0];
      const maxFrameTime = sortedTimes[sortedTimes.length - 1];
      const avgFrameTime = sortedTimes.reduce((sum, time) => sum + time, 0) / sortedTimes.length;
      const avgFps = 1000 / avgFrameTime;
      
      // Store avg FPS for internal tracking (supabase)
      setAverageFps(avgFps);
      
      console.log('Benchmark statistics:');
      console.log(`- Total samples: ${frameTimesRef.current.length}`);
      console.log(`- Min frame time: ${minFrameTime.toFixed(2)} ms`);
      console.log(`- Max frame time: ${maxFrameTime.toFixed(2)} ms`);
      console.log(`- Avg frame time: ${avgFrameTime.toFixed(2)} ms`);
      console.log(`- Avg FPS: ${avgFps.toFixed(2)}`);
      
      logFpsData();
    }
    
    const score = calculateBenchmarkScore(frameTimesRef.current);
    console.log(`Final benchmark score: ${score}`);
    setBenchmarkScore(score);
    setBenchmarkState(BenchmarkState.COMPLETED);
  }

  const calculateBenchmarkScore = (frameTimes: number[]) => {
    if (frameTimes.length === 0) return 0;
    
    const sortedTimes = [...frameTimes].sort((a, b) => a - b);
    const cutOff = Math.floor(sortedTimes.length * 0.1);
    const filteredTimes = sortedTimes.slice(cutOff, sortedTimes.length - cutOff);
    
    // Calculate average frame time
    const avgFrameTime = filteredTimes.reduce((sum, time) => sum + time, 0) / filteredTimes.length;
    
    // Calculate fps
    const avgFps = 1000 / avgFrameTime;
    
    console.log(`Raw average FPS: ${avgFps}`);
    
    //  scoring using a power function instead of a log
    const exponent = 0.75;
    const multiplier = 20;
    const baseValue = 500;
    
    const score = Math.round(baseValue + (Math.pow(avgFps, exponent) * multiplier));
    
    console.log(`Final score: ${score}`);
    
    return score;
  }

  const handleSubmitScore = async () => {
    if (!benchmarkScore || !username || username.trim() === '') return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Log the data being sent
      console.log('Submitting benchmark data:', {
        username: username,
        gpu: gpuInfo.description || gpuInfo.device,
        score: benchmarkScore,
        fps: averageFps
      });
      
      const response = await fetch('/api/submit-benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          gpu: gpuInfo.description || gpuInfo.device,
          score: benchmarkScore,
          fps: averageFps
        })
      });
      
      if (response.ok) {
        window.location.href = '/?refresh=' + new Date().getTime();
      } else {
        let errorMessage = 'Failed to submit score';
        try {
          const errorData = await response.json();
          console.error('Error response:', errorData);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error('Could not parse error response', e);
        }
        setSubmitError(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error submitting score:', error);
      setSubmitError('Error submitting score. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor(ms % 1000 / 10);
    return `${seconds}.${milliseconds.toString().padStart(2, '0')}s`;
  }

  // Used internally by the benchmark
  const forceRenderTest = () => {
    if (!canvasRef.current || !device) {
      console.error('Canvas or device not ready');
      return;
    }
    
    if (!rendererRef.current) {
      console.log('Creating new renderer for test');
      const scene = new Scene();
      const renderer = new Renderer(canvasRef.current, scene);
      rendererRef.current = renderer;
      
      renderer.initialize().then(() => {
        console.log('Renderer initialized, trying to render a test frame');
        // lightweight mode to prevent browser freezing
        const frameTime = renderer.renderSingleFrame(true);
        console.log('Test frame rendered in', frameTime, 'ms');
      }).catch(error => {
        console.error('Error initializing renderer for test:', error);
      });
    } else {
      try {
        // lightweight mode to prevent browser freezing
        const frameTime = rendererRef.current.renderSingleFrame(true);
        console.log('Test frame rendered in', frameTime, 'ms');
      } catch (error) {
        console.error('Error rendering test frame:', error);
      }
    }
  };

  const logFpsData = () => {
    if (averageFps !== null) {
      console.log(`Current average FPS: ${averageFps.toFixed(2)}`);
      return averageFps;
    }
    return 0;
  };

  // a cleanup method for the renderer
  const cleanupRenderer = () => {
    console.log('Cleaning up renderer');
    
    // Clear benchmark interval if it exists
    if (benchmarkIntervalRef.current) {
      clearInterval(benchmarkIntervalRef.current);
      benchmarkIntervalRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (rendererRef.current) {
      try {
        if (rendererRef.current.device) {
          console.log('Destroying GPU device');
          rendererRef.current.device.destroy();
        }
      } catch (error) {
        console.error("Error destroying GPU device:", error);
      }
      rendererRef.current = null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 overflow-hidden relative bg-[radial-gradient(circle_at_20%_20%,_#347ac9_0%,_transparent_40%),radial-gradient(circle_at_90%_80%,_#98BEFE_0%,_transparent_30%)]">
      <header className="w-full max-w-7xl mx-auto mb-12">
        <Link 
          href="/"
          className="text-2xl font-bold bg-gradient-to-r bg-slate-200 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
          Web Bench
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
        <h1 className="text-3xl sm:text-4xl font-bold mb-6 text-center">GPU Benchmark</h1>
      
        {benchmarkState === BenchmarkState.READY && (
          <div 
            onClick={handleBeginClick}
            className="px-8 py-3 text-lg font-medium rounded-full bg-gradient-to-bl bg-gray-950 text-slate-200 transition-all shadow-lg transform border border-transparent hover:border-white hover:border-2 hover:cursor-pointer mb-8">
            Begin
          </div>
        )}
        
        {benchmarkState === BenchmarkState.RUNNING && (
          <div className="px-8 py-3 text-lg font-medium rounded-full bg-gradient-to-bl bg-amber-600 text-white mb-8 animate-pulse">
            Running... {formatTime(elapsedTime)} / {formatTime(BENCHMARK_DURATION_MS)}
          </div>
        )}
        
        {benchmarkState === BenchmarkState.COMPLETED && benchmarkScore && (
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="text-3xl font-bold text-green-400">Score: {benchmarkScore.toLocaleString()}</div>
            {averageFps && (
              <div className="text-xl text-blue-400">Average FPS: {averageFps.toFixed(1)}</div>
            )}
            
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`px-4 py-2 bg-gray-800 border rounded-lg text-white ${
                  profanityResult?.containsProfanity ? 'border-red-500' : 'border-gray-700'
                }`}
              />
              <button
                onClick={handleSubmitScore}
                disabled={isSubmitting || !username || (profanityResult?.containsProfanity ?? false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 hover:cursor-pointer"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Score'}
              </button>

              {profanityResult?.containsProfanity && (
                <div className="mt-2 text-red-400 text-sm">
                  You can&apos;t use that username!!
                </div>
              )}
              
              {submitError && (
                <div className="mt-2 text-red-400 text-sm">
                  {submitError}
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="w-full bg-gray-900/80 rounded-2xl shadow-xl p-6 sm:p-8 backdrop-blur-sm mb-8">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-400">GPU: </span>
                <span>{gpuInfo.description || gpuInfo.device}</span>
              </div>
              {!device && (
                <div className="text-amber-400">
                  {!navigator.gpu 
                    ? "Your browser doesn't support WebGPU. Try Chrome 113+ or enable WebGPU in your browser settings." 
                    : "Waiting for GPU access..."}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Canvas for WebGPU rendering */}
        <div className="w-full aspect-video mb-6 bg-gray-900 rounded-lg overflow-hidden shadow-xl">
          <canvas 
            ref={canvasRef}
            className="w-full h-full"
            width={canvasDimensions.width}
            height={canvasDimensions.height}
          />
        </div>
      </main>
      
      <footer className="mt-auto pt-12 pb-6 text-sm text-gray-400 relative z-10">
        &copy; {new Date().getFullYear()} Web Bench • Performance testing made simple
      </footer>
      <Popup />
    </div>
  );
}