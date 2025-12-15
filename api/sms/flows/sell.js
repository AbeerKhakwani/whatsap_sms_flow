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

        if (Object.keys(ai.extractedData).length > 0) {
            const listingData = {
                ...ai.extractedData,
                photos: mediaUrls
            };
            
            const listing = await createListing(seller.id, listingData);

            await setState(conversation.id, 'sell_collecting', {
                listing_id: listing.id,
                history: [
                    { role: 'user', content: message, photos: mediaUrls },
                    { role: 'assistant', content: ai.message }
                ],
                media_urls: mediaUrls
            });
        } else {
            await setState(conversation.id, 'sell_started', {
                history: [
                    { role: 'user', content: message, photos: mediaUrls },
                    { role: 'assistant', content: ai.message }
                ],
                media_urls: mediaUrls
            });
        }

        return ai.message;
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

        // Merge new data
        const updatedData = { 
            ...currentData, 
            ...ai.extractedData,
            photos: allPhotos
        };

        // Add AI response to history
        history.push({ role: 'assistant', content: ai.message });

        // Save everything
        await updateListingData(listingId, updatedData, history);

        // Check completion AFTER AI response (in case AI extracted new data)
        const stillMissing = REQUIRED_FIELDS.filter(f => !updatedData[f]);
        const finalPhotoCount = allPhotos.length;
        const isNowComplete = stillMissing.length === 0 && finalPhotoCount >= MIN_PHOTOS;

        // Update state - track if we showed summary
        await setState(conversation.id, 'sell_collecting', {
            listing_id: listingId,
            history: history,
            media_urls: allPhotos,
            showed_summary: isNowComplete
        });

        return ai.message;
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
        '👍', '✅', 'lgtm'
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