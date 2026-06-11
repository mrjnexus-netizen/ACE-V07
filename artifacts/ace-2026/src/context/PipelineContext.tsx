import { createContext, useContext, useState, useRef, ReactNode, useCallback, useEffect } from 'react';
import { PipelineJob, PipelineStatus } from '../types';
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

      let processBody: { audioUrl?: string; youtubeUrl?: string };

      if (input.file) {
        // Step 1: upload the audio to S3 via the media route, which returns a URL.
        const form = new FormData();
        form.append('media', input.file);
        form.append('entity_type', 'track-audio');
        form.append('entity_id', crypto.randomUUID());
        const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
        if (!uploaded?.url) throw new Error('Upload did not return a URL');
        setCurrentJob((prev) => prev ? { ...prev, progress: 5 } : null);
        processBody = { audioUrl: uploaded.url };
      } else if (input.youtubeUrl) {
        processBody = { youtubeUrl: input.youtubeUrl };
      } else {
        throw new Error('Either file or youtubeUrl must be provided.');
      }

      // Step 2: start the pipeline. apiPost already unwraps the ApiResponse envelope,
      // so the resolved value IS the data object ({ jobId, trackId }).
      const started = await apiPost<{ jobId: string; trackId: string }>('/api/pipeline/process', processBody);
      const jobId = started?.jobId;
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
      await apiPost(`/api/pipeline/approve/${jobId}`, {});
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