import { createContext, useContext, useState, useRef, ReactNode, useCallback, useEffect } from 'react';
import { PipelineJob, PipelineStatus, MultiLingual } from '../types';
import { apiPost, apiGet } from '../lib/apiClient';

export interface ApprovalOverrides {
  title?: MultiLingual;
  narrative?: MultiLingual;
  coverUrl?: string;
  coverUrlWide?: string;
}

// A file that has finished uploading and is sitting in preview — no
// pipeline job exists for it yet. Per Reza (2026-07-09): upload must be a
// separate, complete step (land as a listenable preview) before AI
// generation is ever triggered; the two must never be bundled together.
export interface StagedAudio {
  url: string;
  fileName: string;
}

// 2026-07-20 (per Reza): the video upload box, mirroring StagedAudio
// exactly — same "upload lands as a playable preview, AI processing is a
// separate deliberate step" rule applies identically to video.
export interface StagedVideo {
  url: string;
  fileName: string;
}

interface PipelineContextType {
  currentJob: PipelineJob | null;
  jobHistory: PipelineJob[];
  stagedAudio: StagedAudio | null;
  stagedVideo: StagedVideo | null;
  uploading: boolean;
  loadingMessage: string | null;
  uploadAudio: (file: File) => Promise<void>;
  uploadVideo: (file: File) => Promise<void>;
  clearStagedAudio: () => void;
  clearStagedVideo: () => void;
  startPipeline: (input?: { youtubeUrl?: string }) => Promise<void>;
  approvePipeline: (jobId: string, overrides?: ApprovalOverrides) => Promise<void>;
  regeneratePipeline: (jobId: string, field: 'art' | 'art-wide' | 'narrative') => Promise<void>;
  cancelJob: () => void;
  resetJob: () => void;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

export const PipelineProvider = ({ children }: { children: ReactNode }) => {
  const [currentJob, setCurrentJob] = useState<PipelineJob | null>(null);
  const [jobHistory, setJobHistory] = useState<PipelineJob[]>([]);
  const [stagedAudio, setStagedAudio] = useState<StagedAudio | null>(null);
  const [stagedVideo, setStagedVideo] = useState<StagedVideo | null>(null);
  const [uploading, setUploading] = useState(false);
  // Human-readable "what's happening right now" text, sourced from the
  // `message` field the server includes on SSE broadcasts (e.g. "Generating
  // cover art with AI — this can take up to a minute…"). Kept separate from
  // PipelineJob on purpose — it's transient UI copy, not job data.
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Step 1 — upload only. Lands the file in S3 and parks it as a listenable
  // preview. No pipeline job is created here and no AI is triggered — that
  // only happens when startPipeline() is explicitly called afterward.
  const uploadAudio = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('media', file);
      form.append('entity_type', 'track-audio');
      form.append('entity_id', crypto.randomUUID());
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (!uploaded?.url) throw new Error('Upload did not return a URL');
      setStagedAudio({ url: uploaded.url, fileName: file.name });
    } catch (err: unknown) {
      console.error('Error uploading audio:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const clearStagedAudio = useCallback(() => setStagedAudio(null), []);

  // 2026-07-20 (per Reza): mirrors uploadAudio exactly — lands the video
  // in S3 as a playable preview, no pipeline job / AI trigger here.
  const uploadVideo = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('media', file);
      form.append('entity_type', 'track-video');
      form.append('entity_id', crypto.randomUUID());
      const uploaded = await apiPost<{ url: string }>('/api/media/upload', form);
      if (!uploaded?.url) throw new Error('Upload did not return a URL');
      setStagedVideo({ url: uploaded.url, fileName: file.name });
    } catch (err: unknown) {
      console.error('Error uploading video:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const clearStagedVideo = useCallback(() => setStagedVideo(null), []);

  // Step 2 — explicit, separate action. Uses the already-uploaded
  // stagedAudio (or a youtubeUrl) to kick off analysis + AI generation.
  const startPipeline = useCallback(async (input?: { youtubeUrl?: string }) => {
    if (currentJob) {
      console.warn('A pipeline job is already in progress.');
      return;
    }
    if (!stagedAudio && !stagedVideo && !input?.youtubeUrl) {
      console.warn('Nothing staged to process — upload a file first.');
      return;
    }

    stopPolling();

    // 2026-07-20 (per Reza): video is its own upload box, mutually
    // exclusive with the audio one — whichever is actually staged (video
    // takes priority if somehow both ended up staged at once, which the
    // UI shouldn't allow but this keeps the fallback sane) determines
    // mediaType end-to-end.
    const mediaType: 'audio' | 'video' = stagedVideo && !input?.youtubeUrl ? 'video' : 'audio';

    try {
      setCurrentJob({
        id: 'initiating',
        status: 'uploading',
        progress: 10,
        mediaType,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedArtUrlWide: null,
        generatedNarrative: null,
        errorMessage: null,
      });

      const processBody: { audioUrl?: string; videoUrl?: string; youtubeUrl?: string } = input?.youtubeUrl
        ? { youtubeUrl: input.youtubeUrl }
        : mediaType === 'video'
          ? { videoUrl: stagedVideo!.url }
          : { audioUrl: stagedAudio!.url };

      // apiPost already unwraps the ApiResponse envelope, so the resolved
      // value IS the data object ({ jobId, trackId }).
      const started = await apiPost<{ jobId: string; trackId: string }>('/api/pipeline/process', processBody);
      const jobId = started?.jobId;
      if (!jobId) throw new Error('No jobId returned from pipeline');

      setCurrentJob((prev) => prev ? { ...prev, id: jobId } : null);

      // Poll for status every 2s instead of using SSE (2026-07-09). SSE
      // silently delivered zero messages in every browser tested on this
      // machine (Chrome incognito, Firefox) despite the exact same server
      // responding correctly and instantly to `curl -N` — extensions,
      // service workers, and the system proxy were each individually
      // ruled out. A plain polled GET is the same kind of request that has
      // worked reliably here the entire time (upload, process, login…), so
      // it sidesteps whatever was uniquely swallowing the streamed response.
      stopPolling();
      const applySnapshot = (data: Record<string, unknown>) => {
        setCurrentJob((prev) => {
          if (!prev) return null;
          const updatedJob: PipelineJob = {
            ...prev,
            status: data.status as PipelineStatus,
            progress: (data.progress as number) ?? prev.progress,
            mediaType: (data.mediaType as 'audio' | 'video') ?? prev.mediaType,
            audioMetadata: (data.audioMetadata as PipelineJob['audioMetadata']) ?? prev.audioMetadata,
            generatedArtUrl: (data.generatedArtUrl as string) ?? prev.generatedArtUrl,
            generatedArtUrlWide: (data.generatedArtUrlWide as string) ?? prev.generatedArtUrlWide,
            generatedNarrative: (data.generatedNarrative as PipelineJob['generatedNarrative']) ?? prev.generatedNarrative,
            errorMessage: (data.errorMessage as string) ?? null,
          };
          if (updatedJob.status === 'complete' || updatedJob.status === 'error') {
            stopPolling();
            setLoadingMessage(null);
            setJobHistory((history) => [...history, updatedJob]);
          }
          return updatedJob;
        });
        if (typeof data.message === 'string' && data.status !== 'complete' && data.status !== 'error') setLoadingMessage(data.message);
      };

      const poll = async () => {
        try {
          const data = await apiGet<Record<string, unknown>>(`/api/pipeline/status-snapshot/${jobId}`);
          if (data) applySnapshot(data);
        } catch (err) {
          console.error('[Pipeline] Status poll failed:', err);
        }
      };

      void poll(); // immediate first read, don't wait 2s for the first update
      pollTimerRef.current = setInterval(() => { void poll(); }, 2000);

    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error starting pipeline:', error);
      setCurrentJob({
        id: 'error',
        status: 'error',
        progress: 100,
        mediaType,
        audioMetadata: null,
        generatedArtUrl: null,
        generatedArtUrlWide: null,
        generatedNarrative: null,
        errorMessage: error.message || 'Failed to start pipeline process.',
      });
      stopPolling();
    }
  }, [currentJob, stagedAudio, stagedVideo, stopPolling]);

  const approvePipeline = useCallback(async (jobId: string, overrides?: ApprovalOverrides) => {
    try {
      await apiPost(`/api/pipeline/approve/${jobId}`, overrides ?? {});
      setCurrentJob((prev) => prev ? { ...prev, status: 'publishing' } : null);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error approving pipeline:', error);
      setCurrentJob((prev) => prev ? { ...prev, errorMessage: error.message || 'Approval failed.' } : null);
    }
  }, []);

  // Art/narrative regeneration: the new value is picked up by the SAME
  // polling loop started in startPipeline (still running at this point —
  // it only stops on 'complete'/'error'), so this just needs to fire the
  // request; the next 2s poll tick reflects the change automatically.
  const regeneratePipeline = useCallback(async (jobId: string, field: 'art' | 'art-wide' | 'narrative') => {
    setLoadingMessage(
      field === 'art' ? 'Starting cover art generation…' :
      field === 'art-wide' ? 'Starting wide banner generation…' :
      'Starting caption generation…'
    );
    try {
      await apiPost(`/api/pipeline/regenerate/${jobId}`, { field });
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error regenerating pipeline field:', error);
      setCurrentJob((prev) => prev ? { ...prev, errorMessage: error.message || 'Regeneration failed.' } : null);
      setLoadingMessage(null);
    }
  }, []);

  const cancelJob = useCallback(() => {
    stopPolling();
    if (currentJob && currentJob.id !== 'initiating' && currentJob.status !== 'complete' && currentJob.status !== 'error') {
      fetch(`/api/pipeline/cancel/${currentJob.id}`, { method: 'POST' }).catch(console.error);
    }
    setCurrentJob(null);
  }, [currentJob, stopPolling]);

  const resetJob = useCallback(() => {
    stopPolling();
    setCurrentJob(null);
    setStagedAudio(null);
    setStagedVideo(null);
    setLoadingMessage(null);
  }, [stopPolling]);

  return (
    <PipelineContext.Provider value={{ currentJob, jobHistory, stagedAudio, stagedVideo, uploading, loadingMessage, uploadAudio, uploadVideo, clearStagedAudio, clearStagedVideo, startPipeline, approvePipeline, regeneratePipeline, cancelJob, resetJob }}>
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