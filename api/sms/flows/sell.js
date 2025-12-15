// api/sms/flows/sell.js
// AI-powered conversational sell flow

import { msg } from '../messages.js';
import { setState, supabase } from '../db.js';
import { generateAIResponse } from '../ai.js';

/**
 * Required fields for a complete listing
 */
const REQUIRED_FIELDS = ['designer', 'item_type', 'size', 'condition', 'asking_price_usd', 'pieces_included'];

/**
 * Minimum photos required
 */
const MIN_PHOTOS = 3;

/**
 * Banned phrases the AI should never say (but might slip through)
 * We strip these before saving to history
 */
const BANNED_PHRASES = [
    'ready to list',
    'ready to submit',
    'submitted',
    'all set',
    'listing complete',
    "you're done",
    "you are done",
    'good to go',
    'listing is complete',
    'all done'
];

/**
 * Sanitize AI message - remove banned phrases
 */
function sanitizeAIMessage(text) {
    if (!text) return text;
    
    let clean = text;
    BANNED_PHRASES.forEach(phrase => {
        const regex = new RegExp(phrase, 'gi');
        clean = clean.replace(regex, '');
    });
    
    // Clean up any double spaces or awkward punctuation left behind
    clean = clean.replace(/\s+/g, ' ').trim();
    clean = clean.replace(/\s+([.,!?])/g, '$1');
    
    return clean;
}

/**
 * Handle all sell flow states
 */
export async function handleSellFlow(message, conversation, seller, mediaUrls = []) {
    const state = conversation.state;
    const context = conversation.context || {};

    // SELL_STARTED - first message after user said "sell"
    if (state === 'sell_started') {
        const ai = await generateAIResponse({
            conversationHistory: [{
                role: 'user',
                content: message,
                photos: mediaUrls
            }],
            currentData: {},
            missingFields: REQUIRED_FIELDS,
            photoCount: mediaUrls.length,
            isReadyForSummary: false
        });

        // Handle photo analysis issues first
        const photoIssue = checkPhotoAnalysis(ai.photoAnalysis, {});
        if (photoIssue) {
            await setState(conversation.id, 'sell_started', {
                history: [
                    { role: 'user', content: message, photos: mediaUrls },
                    // Don't store photoIssue in history
                ],
                media_urls: mediaUrls
            });
            return photoIssue;
        }
        
        // Build photo_flags for future trust scoring
        const photoFlags = buildPhotoFlags(ai.photoAnalysis);

        if (Object.keys(ai.extractedData).length > 0) {
            const listingData = {
                ...ai.extractedData,
                photos: mediaUrls,
                photo_flags: photoFlags
            };
            
            const listing = await createListing(seller.id, listingData);
            const sanitizedMessage = sanitizeAIMessage(ai.message);

            await setState(conversation.id, 'sell_collecting', {
                listing_id: listing.id,
                history: [
                    { role: 'user', content: message, photos: mediaUrls },
                    { role: 'assistant', content: sanitizedMessage }
                ],
                media_urls: mediaUrls
            });

            return sanitizedMessage;
        } else {
            const sanitizedMessage = sanitizeAIMessage(ai.message);
            
            await setState(conversation.id, 'sell_started', {
                history: [
                    { role: 'user', content: message, photos: mediaUrls },
                    { role: 'assistant', content: sanitizedMessage }
                ],
                media_urls: mediaUrls
            });

            return sanitizedMessage;
        }
    }

    // SELL_COLLECTING - ongoing conversation
    if (state === 'sell_collecting') {
        const listingId = context.listing_id;
        const history = context.history || [];
        const alreadyShowedSummary = context.showed_summary || false;

        const listing = await getListing(listingId);
        if (!listing) {
            await setState(conversation.id, 'sell_started', {});
            return msg('SELL_START');
        }

        const currentData = listing.listing_data || {};
        
        // Merge photos
        const existingPhotos = currentData.photos || [];
        const allPhotos = [...existingPhotos, ...mediaUrls];

        // Check what's missing BEFORE this message
        const missingFields = REQUIRED_FIELDS.filter(f => !currentData[f]);
        const photoCount = allPhotos.length;
        
        // Is listing complete? Tell AI to show summary
        const isReadyForSummary = missingFields.length === 0 && photoCount >= MIN_PHOTOS;

        // If we already showed summary and user is confirming, move to final confirmation
        if (alreadyShowedSummary && isConfirmation(message)) {
            await setState(conversation.id, 'sell_confirming', {
                listing_id: listingId,
                history: history
            });
            return msg('SELL_CONFIRM');
        }

        // Add user message to history
        history.push({
            role: 'user',
            content: message,
            photos: mediaUrls
        });

        // Ask AI
        const ai = await generateAIResponse({
            conversationHistory: history,
            currentData: { ...currentData, photos: allPhotos },
            missingFields: missingFields,
            photoCount: photoCount,
            isReadyForSummary: isReadyForSummary
        });

        // Handle photo analysis issues
        const photoIssue = checkPhotoAnalysis(ai.photoAnalysis, currentData);
        if (photoIssue && mediaUrls.length > 0) {
            // Only block on photo issues if they just sent new photos
            // NOTE: Don't store photoIssue in history — it's a system correction, not conversation
            // This prevents AI from referencing its own corrections weirdly later
            
            await updateListingData(listingId, { ...currentData, photos: allPhotos }, history);
            await setState(conversation.id, 'sell_collecting', {
                listing_id: listingId,
                history: history,  // history unchanged — photoIssue not added
                media_urls: allPhotos,
                showed_summary: false
            });
            
            return photoIssue;
        }
        
        // Save photo_flags for future trust scoring / QA
        const photoFlags = buildPhotoFlags(ai.photoAnalysis);

        // Merge new data (include photo_flags for future trust scoring)
        const updatedData = { 
            ...currentData, 
            ...ai.extractedData,
            photos: allPhotos,
            photo_flags: {
                ...currentData.photo_flags,
                ...photoFlags
            }
        };

        // Sanitize and add AI response to history
        const sanitizedMessage = sanitizeAIMessage(ai.message);
        history.push({ role: 'assistant', content: sanitizedMessage });

        // Save everything
        await updateListingData(listingId, updatedData, history);

        // Check completion AFTER AI response
        const stillMissing = REQUIRED_FIELDS.filter(f => !updatedData[f]);
        const finalPhotoCount = allPhotos.length;
        const isNowComplete = stillMissing.length === 0 && finalPhotoCount >= MIN_PHOTOS;

        // If user just edited something, reset showed_summary so they see updated summary
        const userMadeEdit = alreadyShowedSummary && !isConfirmation(message);
        
        // Update state - track if we showed summary
        await setState(conversation.id, 'sell_collecting', {
            listing_id: listingId,
            history: history,
            media_urls: allPhotos,
            showed_summary: userMadeEdit ? false : isNowComplete
        });

        return sanitizedMessage;
    }

    // SELL_CONFIRMING - final YES/NO to submit
    if (state === 'sell_confirming') {
        const listingId = context.listing_id;
        const msgLower = message.toLowerCase().trim();

        if (msgLower === 'yes' || msgLower === 'y' || msgLower === '1') {
            await supabase
                .from('listings')
                .update({ status: 'draft' })
                .eq('id', listingId);

            await setState(conversation.id, 'authorized', {});
            return msg('SELL_COMPLETE');
        }

        if (msgLower === 'no' || msgLower === 'n' || msgLower === '2') {
            await setState(conversation.id, 'sell_collecting', {
                listing_id: listingId,
                history: context.history || [],
                showed_summary: true
            });
            return msg('SELL_EDIT');
        }

        return msg('SELL_CONFIRM');
    }

    return msg('SELL_START');
}

/**
 * Check photo analysis for issues that need user correction
 * Returns a message string if there's a BLOCKING issue, null if OK
 * Note: Brand mismatch is handled conversationally by AI, not blocked here
 */
function checkPhotoAnalysis(photoAnalysis, currentData) {
    if (!photoAnalysis) return null;
    
    const pa = photoAnalysis;
    
    // Confidence gate — don't block on uncertain analysis
    if (pa.confidence !== undefined && pa.confidence < 0.6) {
        return null;
    }
    
    // Not clothing at all — this IS a blocker
    if (pa.is_clothing === false) {
        return "Hmm I might be off, but this pic doesn't look like clothing 😅 Can you resend a photo of the outfit itself? Front view works best 📸";
    }
    
    // Item type mismatch — soft blocker, ask for clarification
    if (pa.matches_description === false && pa.detected_item_type && currentData.item_type) {
        return `Yaar this is really pretty 😍 Just checking — from the pic it looks like a ${pa.detected_item_type}. Am I missing a piece here?`;
    }
    
    // Brand mismatch — NOT a blocker, just let AI ask conversationally
    // Vintage/altered/re-tagged pieces exist, don't halt progress
    // The AI will handle this gently in its response
    
    // Claims NWT but no tag visible — soft prompt, not a hard block
    if (pa.tag_visible === false && currentData.condition?.toLowerCase().includes('new with tags')) {
        return "Quick q — since this is NWT, could you send a clear pic of the tag? Helps buyers trust it 💯";
    }
    
    return null;
}

/**
 * Build photo_flags object for future trust scoring / QA
 * This persists photo analysis insights to listing_data
 */
function buildPhotoFlags(photoAnalysis) {
    if (!photoAnalysis) return {};
    
    const pa = photoAnalysis;
    
    return {
        tag_seen: pa.tag_visible || false,
        brand_verified: pa.tag_visible && pa.brand_matches_claim === true,
        detected_brand: pa.detected_brand_text || null,
        item_type_confidence: pa.confidence || null,
        detected_item_type: pa.detected_item_type || null,
        matches_description: pa.matches_description !== false,
        condition_issues: pa.condition_issues || [],
        needs_better_photos: pa.confidence !== undefined && pa.confidence < 0.6,
        last_analyzed: new Date().toISOString()
    };
}

/**
 * Check if user message is confirming the summary
 */
function isConfirmation(message) {
    const lower = message.toLowerCase().trim();
    const confirmPhrases = [
        'yes', 'yeah', 'yep', 'yup', 'y',
        'looks good', 'look good', 'looks great', 'look great',
        'perfect', 'correct', 'right', 'good', 'great',
        'thats right', "that's right", 'thats correct', "that's correct",
        'all good', 'all set', 'good to go',
        'submit', 'done', 'finish', 'list it',
        'ok', 'okay', 'k', 'sure', 'confirmed', 'confirm',
        '👍', '✅', 'lgtm', 'haan', 'bilkul', 'theek hai'
    ];
    
    return confirmPhrases.some(phrase => lower === phrase || lower.startsWith(phrase + ' ') || lower.endsWith(' ' + phrase));
}

async function createListing(sellerId, initialData = {}) {
    const { data, error } = await supabase
        .from('listings')
        .insert({
            seller_id: sellerId,
            status: 'incomplete',
            listing_data: initialData,
            conversation: []
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function getListing(listingId) {
    const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listingId)
        .single();

    if (error) return null;
    return data;
}

async function updateListingData(listingId, newData, history = []) {
    const { error } = await supabase
        .from('listings')
        .update({
            listing_data: newData,
            conversation: history
        })
        .eq('id', listingId);

    if (error) throw error;
}

export { REQUIRED_FIELDS };