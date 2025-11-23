import React from 'react';
import { useKenshoStore } from '../../stores/useKenshoStore';
import { Loader, CheckCircle, XCircle, Brain } from 'lucide-react';

const statusIcons = {
    pending: <Loader className="h-4 w-4 text-gray-400 animate-pulse" />,
    running: <Loader className="h-4 w-4 animate-spin text-blue-500" />,
    completed: <CheckCircle className="h-4 w-4 text-green-500 animate-pulse" />,
    failed: <XCircle className="h-4 w-4 text-red-500 animate-pulse" />,
};

export function ThoughtStream() {
    const currentThoughtProcess = useKenshoStore(state => state.currentThoughtProcess);

    if (!currentThoughtProcess || currentThoughtProcess.length === 0) {
        return null;
    }

    return (
        <div className="mb-4 rounded-lg border border-blue-200/50 bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-4 backdrop-blur-sm transition-all duration-300">
            <div className="mb-3 flex items-center text-sm font-semibold text-blue-700">
                <Brain className="mr-2 h-4 w-4 animate-bounce" />
                Journal Cognitif
            </div>
            <div className="space-y-2">
                {currentThoughtProcess.map((step) => (
                    <div 
                        key={step.id} 
                        className="flex items-center text-sm text-gray-700 transition-all duration-200 hover:translate-x-1"
                    >
                        <div className="flex-shrink-0 w-4 h-4">
                            {statusIcons[step.status]}
                        </div>
                        <span className="ml-3 font-medium">{step.label}</span>
                        {step.status === 'completed' && step.result && (
                            <span className="ml-2 text-xs text-gray-500 truncate">
                                ✓ {typeof step.result === 'string' ? step.result.substring(0, 30) : 'Complété'}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
