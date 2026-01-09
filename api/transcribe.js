// api/transcribe.js
// Transcribe audio using OpenAI Whisper API
// Optimized for Pakistani designer clothing descriptions

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Context prompt to help Whisper understand Pakistani fashion terminology
const PAKISTANI_FASHION_PROMPT = `This is a description of Pakistani designer clothing for resale.
Common terms: kurta, kameez, shalwar, dupatta, gharara, sharara, lehenga, anarkali, peshwas, angrakha, choli.
Pakistani designers: Sana Safinaz, Maria B, Khaadi, Gul Ahmed, Asim Jofa, Zara Shahjahan, Faraz Manan,
Elan, Sobia Nazir, Baroque, Mushq, Afrozeh, Crimson, Cross Stitch, Saira Shakira, Ammara Khan,
Misha Lakhani, Ali Xeeshan, HSY, Deepak Perwani, Nomi Ansari, Tena Durrani, Shehla Chatoor.
Fabrics: lawn, chiffon, organza, silk, cotton, net, velvet, jamawar, karandi, khaddar, linen.
Embroidery: thread work, mirror work, sequins, dabka, zardozi, gota, resham.`;

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
            prompt: PAKISTANI_FASHION_PROMPT,
            language: 'en' // Primarily English with Urdu/Pakistani terms
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
