import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const key = req.query.key;

    // GET - read setting (public)
    if (req.method === 'GET') {
        if (!key) {
            return res.status(400).json({ error: 'Setting key is required' });
        }

        try {
            const { data, error } = await supabase
                .from('site_settings')
                .select('value')
                .eq('key', key)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return res.status(404).json({ error: 'Setting not found' });
                }
                console.error('Settings fetch error:', error);
                return res.status(500).json({ error: 'Failed to fetch setting' });
            }

            return res.status(200).json({ key, value: data.value });

        } catch (error) {
            console.error('Settings error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // PUT - update setting (admin only)
    if (req.method === 'PUT') {
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'Admin client not configured' });
        }

        const token = req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.substring(7)
            : null;

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized - Missing token' });
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('permission')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || !['ADMIN', 'SYSTEM'].includes(profile.permission)) {
            return res.status(403).json({ error: 'Forbidden - Insufficient privileges' });
        }

        if (!key) {
            return res.status(400).json({ error: 'Setting key is required' });
        }

        const { value } = req.body;
        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }

        try {
            const { error } = await supabaseAdmin
                .from('site_settings')
                .upsert({
                    key,
                    value,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error('Settings update error:', error);
                return res.status(500).json({ error: 'Failed to update setting' });
            }

            return res.status(200).json({ success: true, key, value });

        } catch (error) {
            console.error('Settings error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
