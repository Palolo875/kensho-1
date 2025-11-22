import React, { useRef } from 'react';
import { useKenshoStore } from '../stores/useKenshoStore';
import { Button } from './ui/button';
import { Paperclip, X } from 'lucide-react';
import { Progress } from './ui/progress';

export function FileUploader() {
    const { attachFile, detachFile, attachedFile, uploadProgress } = useKenshoStore();
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            attachFile(e.target.files[0]);
        }
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    if (attachedFile) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-md border border-border">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm truncate max-w-[200px]">{attachedFile.file.name}</span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={detachFile}
                    className="h-6 w-6 p-0 ml-auto"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    if (uploadProgress > 0 && uploadProgress < 100) {
        return (
            <div className="flex flex-col gap-2 px-3 py-2 bg-secondary/50 rounded-md border border-border min-w-[200px]">
                <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Chargement...</span>
                    <span className="text-xs text-muted-foreground ml-auto">{uploadProgress.toFixed(0)}%</span>
                </div>
                <Progress value={uploadProgress} className="h-1" />
            </div>
        );
    }

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => inputRef.current?.click()}
                className="h-9 w-9 p-0"
                type="button"
            >
                <Paperclip className="h-4 w-4" />
            </Button>
            <input
                type="file"
                ref={inputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                accept="application/pdf,image/png,image/jpeg,image/jpg"
            />
        </>
    );
}
