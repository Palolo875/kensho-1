import React from 'react';
import { useKenshoStore } from '../../stores/useKenshoStore';
import { Loader, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const statusIcons = {
    pending: <Loader className="h-4 w-4 text-gray-400" />,
    running: <Loader className="h-4 w-4 animate-spin text-blue-500" />,
    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
};

export function ThoughtStream() {
    const currentThoughtProcess = useKenshoStore(state => state.currentThoughtProcess);

    if (!currentThoughtProcess || currentThoughtProcess.length === 0) {
        return null;
    }

    return (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center text-sm font-semibold text-gray-600">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Processus de réflexion en cours...
            </div>
            <div className="space-y-1">
                {currentThoughtProcess.map(step => (
                    <div key={step.id} className="flex items-center text-sm text-gray-700">
                        {statusIcons[step.status]}
                        <span className="ml-2">{step.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
