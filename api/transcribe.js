// api/transcribe.js
// Transcribe audio using OpenAI Whisper API

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { audio } = req.body;

        if (!audio) {
            return res.status(400).json({ error: 'No audio data provided' });
        }

        // Convert base64 to buffer
        const audioBuffer = Buffer.from(audio, 'base64');

        // Create a File-like object for OpenAI
        const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
        });

        return res.status(200).json({
            text: transcription.text
        });

    } catch (error) {
        console.error('Transcription error:', error);
        return res.status(500).json({
            error: 'Failed to transcribe audio',
            details: error.message
        });
    }
}
