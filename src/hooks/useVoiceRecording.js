// src/hooks/useVoiceRecording.js
// Shared voice recording hook — records audio, transcribes via Whisper, analyzes via GPT

import { useState, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * @param {Object} options
 * @param {function} options.onTranscribed - (text: string) => void — called with raw transcribed text
 * @param {function} options.onFieldsExtracted - (extracted: object, fullText: string) => void — called with AI-extracted fields
 * @param {function} options.onError - (message: string) => void — called on error
 */
export function useVoiceRecording({ onTranscribed, onFieldsExtracted, onError } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const handleError = useCallback((msg) => {
    if (onError) onError(msg);
    else console.error(msg);
  }, [onError]);

  const analyzeText = useCallback(async (text) => {
    if (!text.trim()) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch(`${API_URL}/api/validate-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: text })
      });
      const data = await response.json();
      if (onFieldsExtracted) {
        onFieldsExtracted(data.extracted || {}, text);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      handleError('Could not analyze. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [onFieldsExtracted, handleError]);

  const transcribeAudio = useCallback(async (audioBlob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        const response = await fetch(`${API_URL}/api/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64Audio })
        });

        const data = await response.json();
        if (data.text) {
          const newText = transcribedText + (transcribedText ? ' ' : '') + data.text;
          setTranscribedText(newText);
          setIsTranscribing(false);
          if (onTranscribed) onTranscribed(newText);
          await analyzeText(newText);
        } else {
          handleError('Could not transcribe audio. Please try again or type instead.');
          setIsTranscribing(false);
        }
      };
    } catch (error) {
      console.error('Transcription error:', error);
      handleError('Transcription failed. Please try again.');
      setIsTranscribing(false);
    }
  }, [transcribedText, onTranscribed, analyzeText, handleError]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      handleError('Could not access microphone. Please check permissions.');
    }
  }, [transcribeAudio, handleError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const reset = useCallback(() => {
    setTranscribedText('');
    setIsRecording(false);
    setIsTranscribing(false);
    setIsAnalyzing(false);
  }, []);

  return {
    isRecording,
    isTranscribing,
    isAnalyzing,
    transcribedText,
    startRecording,
    stopRecording,
    analyzeText,
    reset
  };
}
