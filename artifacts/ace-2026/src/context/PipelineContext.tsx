import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PipelineJob, PipelineStatus } from '../types';

interface PipelineContextType {
  currentJob: PipelineJob | null;
  jobHistory: PipelineJob[];
  startJob: (title: string, genre: string, audioUrl: string) => Promise<void>;
  cancelJob: () => void;
  resetJob: () => void;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

export const PipelineProvider = ({ children }: { children: ReactNode }) => {
  const [currentJob, setCurrentJob] = useState<PipelineJob | null>(null);
  const [jobHistory, setJobHistory] = useState<PipelineJob[]>([]);
  const [sseSource, setSseSource] = useState<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (sseSource) {
        sseSource.close();
      }
    };
  }, [sseSource]);

  const startJob = async (title: string, genre: string, audioUrl: string) => {
    try {
      setCurrentJob({
        id: 'starting',
        status: 'uploading',
        progress: 10,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedNarrative: null,
        errorMessage: null,
      });

      const response = await fetch('/api/pipeline/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, genre, audioUrl }),
      });

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to start pipeline processing');
      }

      const { jobId } = resData.data;

      // Initialize SSE listener
      const source = new EventSource(`/api/pipeline/status/${jobId}`);
      setSseSource(source);

      setCurrentJob({
        id: jobId,
        status: 'uploading',
        progress: 15,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedNarrative: null,
        errorMessage: null,
      });

      source.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'STATUS_UPDATE') {
          setCurrentJob((prev) => {
            if (!prev) return null;
            const updated: PipelineJob = {
              ...prev,
              status: data.status as PipelineStatus,
              progress: data.progress,
              audioMetadata: data.metadata || prev.audioMetadata,
              generatedArtUrl: data.generatedArtUrl || prev.generatedArtUrl,
              generatedNarrative: data.generatedNarrative || prev.generatedNarrative,
              errorMessage: data.error || null,
            };

            if (data.status === 'complete' || data.status === 'error') {
              source.close();
              setSseSource(null);
              setJobHistory((history) => [...history, updated]);
            }

            return updated;
          });
        }
      };

      source.onerror = (err) => {
        console.error('SSE pipeline stream error:', err);
        setCurrentJob((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'error',
            errorMessage: 'Real-time event sync lost',
          };
        });
        source.close();
        setSseSource(null);
      };

    } catch (err: any) {
      console.error('Failed to process track media pipeline:', err);
      setCurrentJob({
        id: 'error',
        status: 'error',
        progress: 100,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedNarrative: null,
        errorMessage: err.message || 'Failed to initialize background media process',
      });
    }
  };

  const cancelJob = () => {
    if (sseSource) {
      sseSource.close();
      setSseSource(null);
    }
    setCurrentJob(null);
  };

  const resetJob = () => {
    setCurrentJob(null);
  };

  return (
    <PipelineContext.Provider value={{ currentJob, jobHistory, startJob, cancelJob, resetJob }}>
      {children}
    </PipelineContext.Provider>
  );
};

export const usePipeline = () => {
  const context = useContext(PipelineContext);
  if (context === undefined) {
    throw new Error('usePipeline must be used within a PipelineProvider');
  }
  return context;
};
