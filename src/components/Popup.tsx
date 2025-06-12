"use client";

import React, { useState, useEffect } from "react";

const Popup = () => {
const [isOpen, setIsOpen] = useState(false);

useEffect(() => {
    const hasSeenPopup = localStorage.getItem("hasSeenBenchmarkPopup");
    if (!hasSeenPopup) {
    setIsOpen(true);
    }
}, []);
// might change this to always show whenever the user visits the page instead of one time
const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("hasSeenBenchmarkPopup", "true");
};

if (!isOpen) {
    return null;
}

return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
    <div className="relative w-full max-w-lg p-8 mx-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-xl">
        <h2 className="text-2xl font-bold text-center mb-4 text-slate-100">
        Important Information
        </h2>

        {/* Content */}
        <div className="space-y-4 text-slate-300">
        <p>
            This is a simple, powerful GPU stress test.
        </p>

        <ul className="list-disc list-inside space-y-2 pl-2">
            <li>
            <strong>Performance Notice:</strong> The benchmark may cause your browser to slow down or become
            temporarily unresponsive.
            </li>
            <li>
            <strong>For Best Results:</strong> For the highest score,
            consider closing other applications and browser tabs. If you&apos;re
            on a laptop or mobile device, try plugging it into a power source.
            </li>
            <li>
            <strong>Disclaimer:</strong> The chance of data loss is
            extremely low (&lt;0.01%). Why is why it&apos;s good practice to 
            just close all other tabs that you don&apos;t need.
            </li>
        </ul>
        </div>

        <div className="mt-8 text-center">
        <button
            onClick={handleClose}
            className="px-8 py-3 font-medium rounded-full bg-blue-600 text-slate-100 transition-all shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 hover:cursor-pointer">
            I Understand, Proceed to Benchmark
        </button>
        </div>
    </div>
    </div>
);
};

export default Popup;
