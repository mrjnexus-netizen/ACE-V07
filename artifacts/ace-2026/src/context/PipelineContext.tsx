import { createContext, useContext, useState, useRef, ReactNode, useCallback, useEffect } from 'react';
import { PipelineJob, PipelineStatus, ApiResponse } from '../types';
import { apiPost } from '../lib/apiClient';

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

  const startPipeline = useCallback(async (input: { file?: File; youtubeUrl?: string }) => {
    if (currentJob) {
      console.warn('A pipeline job is already in progress.');
      return;
    }

    closeEventSource();

    try {
      setCurrentJob({
        id: 'initiating',
        status: 'uploading',
        progress: 0,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedNarrative: null,
        errorMessage: null,
      });

      let resData: ApiResponse<{ jobId: string; trackId: string }>;

      if (input.file) {
        const formData = new FormData();
        formData.append('audioFile', input.file);
        resData = await apiPost<ApiResponse<{ jobId: string; trackId: string }>>('/api/pipeline/process', formData);
      } else if (input.youtubeUrl) {
        resData = await apiPost<ApiResponse<{ jobId: string; trackId: string }>>('/api/pipeline/process', { youtubeUrl: input.youtubeUrl });
      } else {
        throw new Error('Either file or youtubeUrl must be provided.');
      }

      const jobId = resData.data?.jobId;
      if (!jobId) throw new Error('No jobId returned from pipeline');

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
            progress: data.progress ?? prev.progress,
            audioMetadata: data.audioMetadata ?? prev.audioMetadata,
            generatedArtUrl: data.generatedArtUrl ?? prev.generatedArtUrl,
            generatedNarrative: data.generatedNarrative ?? prev.generatedNarrative,
            errorMessage: data.errorMessage ?? null,
          };

          if (updatedJob.status === 'complete' || updatedJob.status === 'error') {
            closeEventSource();
            setJobHistory((history) => [...history, updatedJob]);
          }
          return updatedJob;
        });
      };

      source.onerror = () => {
        setCurrentJob((prev) => prev ? { ...prev, status: 'error', errorMessage: 'Real-time updates interrupted.' } : null);
        closeEventSource();
      };

    } catch (err: unknown) {
      const error = err as Error;
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
  }, [currentJob, closeEventSource]);

  const approvePipeline = useCallback(async (jobId: string) => {
    try {
      await apiPost<ApiResponse<null>>(`/api/pipeline/approve/${jobId}`, {});
      setCurrentJob((prev) => prev ? { ...prev, status: 'publishing' } : null);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error approving pipeline:', error);
      setCurrentJob((prev) => prev ? { ...prev, errorMessage: error.message || 'Approval failed.' } : null);
    }
  }, []);

  const cancelJob = useCallback(() => {
    closeEventSource();
    if (currentJob && currentJob.id !== 'initiating' && currentJob.status !== 'complete' && currentJob.status !== 'error') {
      fetch(`/api/pipeline/cancel/${currentJob.id}`, { method: 'POST' }).catch(console.error);
    }
    setCurrentJob(null);
  }, [currentJob, closeEventSource]);

  const resetJob = useCallback(() => {
    closeEventSource();
    setCurrentJob(null);
  }, [closeEventSource]);

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
