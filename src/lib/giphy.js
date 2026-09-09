import axios from 'axios';
import { logger } from './logger.js';
import { config } from '../config.js';
const GIPHY_API_KEY = config.giphy.apiKey;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

export async function scrapeGiphyStickers(query) {
    const formattedQuery = encodeURIComponent(query.toLowerCase().trim());

    const url = `https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_API_KEY}&q=${formattedQuery}&limit=25`;

    try {
        const { data } = await axios.get(url, {
            timeout: 15000,
        });

        const results = [];
        const items = data.data;

        for (const item of items) {
            results.push({
                id: item.id,
                title: item.title || 'No Title',
                gifUrl: item.images.original.url,
                pageUrl: item.url
            });
        }

        return results;
    } catch (e) {
        logger.error(`[giphy] API request gagal ("${query}"): ${e.response ? JSON.stringify(e.response.data) : e.message}`);
        return [];
    }
}

export async function getRandomMoodSticker(mood) {
    const results = await scrapeGiphyStickers(mood);
    if (!results.length) return null;

    const pick = results[Math.floor(Math.random() * results.length)];

    try {
        const res = await axios.get(pick.gifUrl, {
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: { 'User-Agent': UA },
        });
        return Buffer.from(res.data);
    } catch (e) {
        logger.error(`[giphy] download stiker gagal ("${mood}"): ${e.message}`);
        return null;
    }
}
