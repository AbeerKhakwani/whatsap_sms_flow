// api/sms/flows/sell.js
// AI-powered conversational sell flow

import { msg } from '../messages.js';
import { setState, supabase } from '../db.js';
import { generateAIResponse } from '../ai.js';

/**
 * Required fields for a complete listing
 */
const REQUIRED_FIELDS = ['designer', 'item_type', 'size', 'condition', 'asking_price_usd', 'pieces'];

/**
 * Handle all sell flow states
 * @param {string} message - What the user texted
 * @param {object} conversation - The conversation record from DB
 * @param {object} seller - The seller record from DB
 * @param {array} mediaUrls - Any photos they sent (empty for now)
 */

export async function handleSellFlow(message, conversation, seller, mediaUrls = []) {
    const state = conversation.state;
    const context = conversation.context || {};

    // SELL_STARTED - first message after user said "sell"
    // SELL_STARTED - first message after user said "sell"
    if (state === 'sell_started') {
        // 1. Ask AI to extract data (include photos if sent)
        const ai = await generateAIResponse({
            conversationHistory: [{
                role: 'user',
                content: message,
                photos: mediaUrls  // ← Add this
            }],
            currentData: {},
            missingFields: REQUIRED_FIELDS
        });

        // 2. Only create listing if AI extracted something
        if (Object.keys(ai.extractedData).length > 0) {
            const listing = await createListing(seller.id, ai.extractedData);

            await setState(conversation.id, 'sell_collecting', {
                listing_id: listing.id,
                history: [
                    { role: 'user', content: message, photos: mediaUrls },  // ← Add photos
                    { role: 'assistant', content: ai.message }
                ]
            });
        } else {
            // No data extracted, stay in sell_started
            await setState(conversation.id, 'sell_started', {
                history: [
                    { role: 'user', content: message, photos: mediaUrls },  // ← Add photos
                    { role: 'assistant', content: ai.message }
                ]
            });
        }

        return ai.message;
    }

    // SELL_COLLECTING - ongoing conversation
    if (state === 'sell_collecting') {
        const listingId = context.listing_id;
        const history = context.history || [];

        // 1. Get current listing data
        const listing = await getListing(listingId);
        if (!listing) {
            // Lost the listing somehow, restart
            await setState(conversation.id, 'sell_started', {});
            return msg('SELL_START');
        }

        const currentData = listing.listing_data || {};

        // 2. Figure out what fields are still missing
        const missingFields = REQUIRED_FIELDS.filter(f => !currentData[f]);

        // 3. Add user message to history
        // 3. Add user message to history (with photos)
        history.push({
            role: 'user',
            content: message,
            photos: mediaUrls  // ← Add this
        });

        // 4. Ask AI (with photos)
        const ai = await generateAIResponse({
            conversationHistory: history,
            currentData: currentData,
            missingFields: missingFields,
            photos: mediaUrls  // ← Add this
        });

        // 5. Merge new data with existing
        const updatedData = { ...currentData, ...ai.extractedData };

        // 6. Add AI response to history
        history.push({ role: 'assistant', content: ai.message });

        // 7. Save everything
        await updateListingData(listingId, updatedData, history);
        await setState(conversation.id, 'sell_collecting', {
            listing_id: listingId,
            history: history
        });

        // 8. Check if complete
        const stillMissing = REQUIRED_FIELDS.filter(f => !updatedData[f]);
        if (stillMissing.length === 0) {
            // All done! Move to confirmation
            await setState(conversation.id, 'sell_confirming', {
                listing_id: listingId
            });
            return ai.message + '\n\n' + msg('SELL_CONFIRM');
        }

        return ai.message;
    }

    // SELL_CONFIRMING - user confirms or wants to edit
    if (state === 'sell_confirming') {
        const listingId = context.listing_id;
        const msgLower = message.toLowerCase().trim();

        if (msgLower === 'yes' || msgLower === 'y' || msgLower === '1') {
            // User confirms - update listing status to draft
            await supabase
                .from('listings')
                .update({ status: 'draft' })
                .eq('id', listingId);

            await setState(conversation.id, 'authorized', {});
            return msg('SELL_COMPLETE');
        }

        if (msgLower === 'no' || msgLower === 'n' || msgLower === '2') {
            // User wants to edit - go back to collecting
            await setState(conversation.id, 'sell_collecting', {
                listing_id: listingId,
                history: context.history || []
            });
            return msg('SELL_EDIT');
        }

        // Unclear response - ask again
        return msg('SELL_CONFIRM');
    }

    // Default - shouldn't hit this
    return msg('SELL_START');
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