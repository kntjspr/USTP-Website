const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

const ALLOWED_ORIGINS = [
    'https://gdgustp.com',
    'https://www.gdgustp.com',
    `http://localhost:${PORT}`,
    'http://localhost:3000',
    'http://localhost:5000'
];

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error('Origin not allowed by CORS'));
    },
    credentials: false
}));

// Serve static files from build directory
app.use(express.static(path.join(__dirname, 'build')));

// API Routes - Handle ES6 modules properly
app.post('/api/analyze-personality', async (req, res) => {
    try {
        console.log('API request received:', {
            method: req.method,
            url: req.url,
            headers: Object.keys(req.headers),
            bodySize: JSON.stringify(req.body).length
        });

        const { default: handler } = await import('./api/analyze-personality.js');
        await handler(req, res);
    } catch (error) {
        console.error('Error loading analyze-personality handler:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

app.get('/api/tinymce-config', async (req, res) => {
    try {
        const { default: handler } = await import('./api/tinymce-config.js');
        await handler(req, res);
    } catch (error) {
        console.error('Error loading tinymce-config handler:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Public API routes
app.get('/api/posts', async (req, res) => {
    try {
        const { default: handler } = await import('./api/posts.js');
        await handler(req, res);
    } catch (error) {
        console.error('Error loading posts handler:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/events', async (req, res) => {
    try {
        const { default: handler } = await import('./api/events.js');
        await handler(req, res);
    } catch (error) {
        console.error('Error loading events handler:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Check for admin API routes
app.all('/api/admin/supabase-admin', async (req, res) => {
    try {
        const { default: handler } = await import('./api/admin/supabase-admin.js');
        await handler(req, res);
    } catch (error) {
        console.error('Error loading admin handler:', error);
        res.status(500).json({ error: 'Admin API not available' });
    }
});

// Settings API
app.all('/api/settings', async (req, res) => {
    try {
        const { default: handler } = await import('./api/settings.js');
        await handler(req, res);
    } catch (error) {
        console.error('Error loading settings handler:', error);
        res.status(500).json({ error: 'Settings API not available' });
    }
});

// Registrations API
app.all('/api/registrations', async (req, res) => {
    try {
        const { default: handler } = await import('./api/registrations.js');
        await handler(req, res);
    } catch (error) {
        console.error('Error loading registrations handler:', error);
        res.status(500).json({ error: 'Registrations API not available' });
    }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`React app: http://localhost:${PORT}`);
    console.log(`API endpoints:`);
    console.log(`  POST http://localhost:${PORT}/api/analyze-personality`);
    console.log(`  GET  http://localhost:${PORT}/api/tinymce-config`);
});

module.exports = app;
