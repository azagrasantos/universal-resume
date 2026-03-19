
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

// Cache-status endpoint (now after initializing app)
app.get('/api/cache-status', (req, res) => {
    const CACHE_FILE = __dirname + '/linkedin-cache.json';
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let cache = { timestamp: 0, data: null };
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf8');
            cache = JSON.parse(raw);
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error reading cache file', details: err.message });
    }
    const now = Date.now();
    const expired = (now - cache.timestamp) > ONE_DAY;
    res.json({
        timestamp: cache.timestamp,
        expired,
        age_ms: now - cache.timestamp,
        cached: !!cache.data
    });
});

app.get('/api/user-profile', async (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const CACHE_FILE = __dirname + '/linkedin-cache.json';
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let cache = { timestamp: 0, data: null };
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf8');
            cache = JSON.parse(raw);
        }
    } catch (err) {
        console.error('Error reading cache file:', err);
    }

    const now = Date.now();
    if (cache.data && (now - cache.timestamp < ONE_DAY)) {
        console.log('Serving data from cache file');
        return res.json({ data: cache.data, cached: true });
    }

    try {
        const params = new URLSearchParams({
            username: username,
            include_follower_and_connection: 'false',
            include_experiences: 'true',
            include_skills: 'false',
            include_certifications: 'false',
            include_publications: 'false',
            include_educations: 'true',
            include_volunteers: 'false',
            include_honors: 'false',
            include_interests: 'false',
            include_bio: 'true',
            include_spoken_languages: 'true'
        });

        const url = `https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/user/profile?${params}`;
        console.log('Calling LinkedIn API:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'fresh-linkedin-scraper-api.p.rapidapi.com'
            }
        });

        console.log('API response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            // Do not update cache if there is an error
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        console.log('LinkedIn API data received, updating cache file');
        // Update cache
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: now, data }), 'utf8');
        } catch (err) {
            console.error('Error writing cache file:', err);
        }
        res.json({ data, cached: false });
    } catch (error) {
        console.error('Server error:', error);
        // If there is an error, serve cache if it exists
        if (cache.data) {
            return res.json({ data: cache.data, cached: true });
        }
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Endpoint to force cache update
app.get('/api/refresh-cache', async (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    const CACHE_FILE = __dirname + '/linkedin-cache.json';
    const now = Date.now();
    try {
        const params = new URLSearchParams({
            username: username,
            include_follower_and_connection: 'false',
            include_experiences: 'true',
            include_skills: 'true',
            include_certifications: 'false',
            include_publications: 'false',
            include_educations: 'true',
            include_volunteers: 'false',
            include_honors: 'false',
            include_interests: 'false',
            include_bio: 'true',
            include_spoken_languages: 'true'
        });
        const url = `https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/user/profile?${params}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'fresh-linkedin-scraper-api.p.rapidapi.com'
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: errorText });
        }
        const data = await response.json();
        // Force update cache
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: now, data }), 'utf8');
        } catch (err) {
            return res.status(500).json({ error: 'Error writing cache file', details: err.message });
        }
        res.json({ data, cached: false, refreshed: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
