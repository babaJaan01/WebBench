import Link from "next/link";
import Leaderboard from "@/components/Leaderboard";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 overflow-hidden relative bg-[radial-gradient(circle_at_20%_20%,_#347ac9_0%,_transparent_40%),radial-gradient(circle_at_90%_80%,_#98BEFE_0%,_transparent_30%)]">
      {/* Noise texture overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWx0ZXI9InVybCgjYSkiIG9wYWNpdHk9Ii4wNSIvPjwvc3ZnPg==')] bg-repeat opacity-60"></div>
      
      <main className="max-w-4xl w-full flex flex-col items-center relative z-10">
        <div className="text-center mb-12">
          <div className="bg-gradient-to-r bg-clip-text">
            <h1 className="text-5xl sm:text-6xl font-bold mb-4">Web Bench</h1>
          </div>
          <p className="text-xl sm:text-2xltext-gray-200 mb-12">
            Real-time GPU benchmark tests in your browser.
          </p>
          
          <Link 
            href="/run" 
            className="px-8 py-3 text-lg font-medium rounded-full bg-gradient-to-bl bg-gray-950 text-slate-200 transition-all shadow-lg transform border border-transparent hover:border-white hover:border-2">
            Start Benchmark
          </Link>
        </div>

        <Leaderboard />
      </main>
      
      <footer className="mt-auto pt-12 pb-6 text-sm text-gray-400 relative z-10">
        &copy; {new Date().getFullYear()} Web Bench • Performance testing made simple
      </footer>
    </div>
  );
}
