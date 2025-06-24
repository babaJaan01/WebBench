"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProfanityChecker } from 'glin-profanity';
import { runComputeBenchmark } from '../../lib/computeBenchmark';
import Popup from '../../components/Popup';

// Format the WebGL renderer string so users see a nice GPU name.
const formatGpuName = (raw: string): string => {
  if (!raw) return 'Unknown GPU';
  let match = raw.match(/ANGLE Metal Renderer:\s*([^,]+)/);
  if (match?.[1]) return match[1].trim();
  match = raw.match(/ANGLE \([^,]+, ([^,(]+)/);
  return match?.[1]?.trim() || raw;
};

const getGpuName = (): string => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'Unknown GPU (no WebGL)';
    const debug = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = debug
      ? (gl as any).getParameter((debug as any).UNMASKED_RENDERER_WEBGL)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (gl as any).getParameter((gl as any).RENDERER);
    return typeof raw === 'string' ? formatGpuName(raw) : 'Unknown GPU';
  } catch {
    return 'Unknown GPU (error)';
  }
};

enum BenchmarkState { READY, RUNNING, COMPLETED, ERROR }

export default function ComputePage() {
  const [gpuInfo, setGpuInfo] = useState({ description: 'Detecting…', device: '' });
  const [device, setDevice] = useState<GPUDevice | null>(null);
  const [state, setState] = useState<BenchmarkState>(BenchmarkState.READY);
  const [gflops, setGflops] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // profanity checker
  const { result: profanityResult, checkText } = useProfanityChecker({ allLanguages: true, autoReplace: false });
  useEffect(() => {
    const t = setTimeout(() => username && checkText(username), 300);
    return () => clearTimeout(t);
  }, [username, checkText]);

  // Init WebGPU once
  useEffect(() => {
    const detect = async () => {
      const niceName = getGpuName();
      if (!navigator.gpu) {
        setGpuInfo({ description: niceName, device: 'WebGPU not supported' });
        return;
      }
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        setGpuInfo({ description: niceName, device: 'Cannot get GPU adapter' });
        return;
      }
      const dev = await adapter.requestDevice();
      setDevice(dev);
      setGpuInfo({ description: niceName, device: '' });
    };
    detect();
  }, []);

  const startBenchmark = async () => {
    if (!device) return;
    setState(BenchmarkState.RUNNING);
    try {
      const { gflops, timeMs } = await runComputeBenchmark(device);
      setGflops(gflops);
      setTimeMs(timeMs);
      const computedScore = Math.round(gflops * 10);
      setScore(computedScore);
      console.log(`Benchmark ran for ${(timeMs/1000).toFixed(1)}s, score: ${computedScore}, gflops: ${gflops.toFixed(1)}`);
      setState(BenchmarkState.COMPLETED);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setSubmitError(msg);
      setState(BenchmarkState.ERROR);
    }
  };

  const handleSubmit = async () => {
    if (!score || !username || profanityResult?.containsProfanity) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/submit-benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, gpu: gpuInfo.description, score, fps: gflops }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Submission failed');
      }
      window.location.href = '/?refresh=' + new Date().getTime();
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-slate-200">
      <header className="w-full max-w-7xl mx-auto mb-12">
        <Link href="/" className="text-2xl font-bold bg-gradient-to-r bg-slate-200 bg-clip-text text-transparent hover:opacity-80">
          Web Bench
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-lg mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-8">Compute Benchmark</h1>

        {state === BenchmarkState.READY && (
          <button onClick={startBenchmark} className="px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-700 hover:cursor-pointer font-medium shadow-lg">
            Begin
          </button>
        )}

        {state === BenchmarkState.RUNNING && (
          <div className="px-8 py-3 rounded-full bg-amber-600 text-white font-medium animate-pulse">Running…</div>
        )}

        {state === BenchmarkState.COMPLETED && score !== null && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-3xl font-bold text-green-400">Score: {score.toLocaleString()}</div>
            {timeMs && <div className="text-md text-gray-400">Time elapsed: {Math.round(timeMs/1000)}s</div>}

            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className={`px-4 py-2 bg-gray-800 border rounded-lg text-white ${profanityResult?.containsProfanity ? 'border-red-500' : 'border-gray-700'}`}
            />
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !username || (profanityResult?.containsProfanity ?? false)}
              className="px-4 py-2 bg-blue-600 rounded-lg disabled:opacity-50 hover:bg-blue-700 mt-2"
            >
              {isSubmitting ? 'Submitting…' : 'Submit Score'}
            </button>
            {submitError && <div className="text-red-400 text-sm mt-2">{submitError}</div>}
            {profanityResult?.containsProfanity && <div className="text-red-400 text-sm mt-2">Username not allowed.</div>}
          </div>
        )}

        {state === BenchmarkState.ERROR && (
          <div className="text-red-400">Benchmark failed. Check console for details.</div>
        )}

        <div className="mt-8 text-gray-400">GPU: {gpuInfo.description}</div>
      </main>

      <footer className="mt-auto pt-12 pb-6 text-sm text-gray-400">
        &copy; {new Date().getFullYear()} Web Bench
      </footer>
      <Popup />
    </div>
  );
} 