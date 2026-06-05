import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { PipelineJob, PipelineStatus } from '../types';

interface PipelineContextType {
  currentJob: PipelineJob | null;
  jobHistory: PipelineJob[];
  startPipeline: (input: { file?: File; youtubeUrl?: string }) => Promise<void>;
  approvePipeline: (jobId: string) => Promise<void>;
  cancelJob: () => void;
  resetJob: () => void;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

export const PipelineProvider = ({ children }: { children: ReactNode }) => {
  const [currentJob, setCurrentJob] = useState<PipelineJob | null>(null);
  const [jobHistory, setJobHistory] = useState<PipelineJob[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, [closeEventSource]);

  const startPipeline = async (input: { file?: File; youtubeUrl?: string }) => {
    if (currentJob) {
      console.warn('A pipeline job is already in progress. Please wait or cancel it.');
      return;
    }

    closeEventSource(); // Ensure any old connection is closed

    try {
      setCurrentJob({
        id: 'temp-id',
        status: 'uploading',
        progress: 0,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedNarrative: null,
        errorMessage: null,
      });

      let response;
      let jobId: string;

      if (input.file) {
        const formData = new FormData();
        formData.append('audioFile', input.file);
        response = await fetch('/api/pipeline/process/upload', {
          method: 'POST',
          body: formData,
        });
      } else if (input.youtubeUrl) {
        response = await fetch('/api/pipeline/process/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ youtubeUrl: input.youtubeUrl }),
        });
      } else {
        throw new Error('Either file or youtubeUrl must be provided.');
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to initiate pipeline processing');
      }
      jobId = resData.data.jobId;

      setCurrentJob((prev) => prev ? { ...prev, id: jobId, progress: 10 } : null);

      const source = new EventSource(`/api/pipeline/status/${jobId}`);
      eventSourceRef.current = source;

      source.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setCurrentJob((prev) => {
          if (!prev) return null;

          const updatedJob: PipelineJob = {
            ...prev,
            status: data.status as PipelineStatus,
            progress: data.progress,
            audioMetadata: data.audioMetadata || prev.audioMetadata,
            generatedArtUrl: data.generatedArtUrl || prev.generatedArtUrl,
            generatedNarrative: data.generatedNarrative || prev.generatedNarrative,
            errorMessage: data.errorMessage || null,
          };

          if (updatedJob.status === 'complete' || updatedJob.status === 'error') {
            closeEventSource();
            setJobHistory((history) => [...history, updatedJob]);
          }
          return updatedJob;
        });
      };

      source.onerror = (error) => {
        console.error('SSE connection error:', error);
        setCurrentJob((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'error',
            errorMessage: 'Real-time updates interrupted.',
          };
        });
        closeEventSource();
      };

    } catch (error: any) {
      console.error('Error starting pipeline:', error);
      setCurrentJob({
        id: 'error',
        status: 'error',
        progress: 100,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedNarrative: null,
        errorMessage: error.message || 'Failed to start pipeline process.',
      });
      closeEventSource();
    }
  };

  const approvePipeline = async (jobId: string) => {
    try {
      const response = await fetch(`/api/pipeline/approve/${jobId}`, {
        method: 'POST',
      });
      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to approve pipeline job');
      }
      setCurrentJob((prev) => prev ? { ...prev, status: 'publishing' } : null);
    } catch (error: any) {
      console.error('Error approving pipeline:', error);
      setCurrentJob((prev) => {
        if (!prev) return null;
        return { ...prev, errorMessage: error.message || 'Approval failed.' };
      });
    }
  };

  const cancelJob = () => {
    closeEventSource();
    if (currentJob && currentJob.id !== 'temp-id' && currentJob.status !== 'complete' && currentJob.status !== 'error') {
      // Optionally send a cancel request to the backend
      fetch(`/api/pipeline/cancel/${currentJob.id}`, { method: 'POST' }).catch(console.error);
    }
    setCurrentJob(null);
  };

  const resetJob = () => {
    closeEventSource();
    setCurrentJob(null);
  };

  return (
    <PipelineContext.Provider value={{ currentJob, jobHistory, startPipeline, approvePipeline, cancelJob, resetJob }}>
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