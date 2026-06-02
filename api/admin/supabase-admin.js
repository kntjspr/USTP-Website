import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Create admin client with service key (server-side only)
const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Check if admin client is configured
    if (!supabaseAdmin) {
        console.error('Supabase admin client is not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : null;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized - Missing or invalid token' });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    // Verify the user has ADMIN or SYSTEM permission in the users table
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('users')
        .select('permission')
        .eq('id', user.id)
        .single();

    if (profileError || !profile || !['ADMIN', 'SYSTEM'].includes(profile.permission)) {
        return res.status(403).json({ error: 'Forbidden - Insufficient privileges' });
    }

    const ALLOWED_TABLES = ['users', 'blog_posts', 'events', 'registrations', 'short_urls'];

    try {
        const { action, table, data, filters, id } = req.body;

        if (!action || !table) {
            return res.status(400).json({ error: 'Action and table are required' });
        }

        if (!ALLOWED_TABLES.includes(table)) {
            return res.status(403).json({ error: 'Access to this table is not allowed' });
        }

        let result;

        switch (action) {
            case 'select':
                if (filters) {
                    let query = supabaseAdmin.from(table).select('*');
                    Object.entries(filters).forEach(([key, value]) => {
                        query = query.eq(key, value);
                    });
                    result = await query;
                } else {
                    result = await supabaseAdmin.from(table).select('*');
                }
                break;

            case 'insert':
                if (!data) {
                    return res.status(400).json({ error: 'Data is required for insert' });
                }
                result = await supabaseAdmin.from(table).insert(data);
                break;

            case 'update':
                if (!data || !id) {
                    return res.status(400).json({ error: 'Data and ID are required for update' });
                }
                result = await supabaseAdmin.from(table).update(data).eq('id', id);
                break;

            case 'delete':
                if (!id) {
                    return res.status(400).json({ error: 'ID is required for delete' });
                }
                result = await supabaseAdmin.from(table).delete().eq('id', id);
                break;

            case 'count':
                result = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
                break;

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

        if (result.error) {
            console.error('Supabase admin operation error:', result.error);
            return res.status(400).json({ error: result.error.message });
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Error in admin operation:', error);
        return res.status(500).json({ 
            error: 'Internal server error during admin operation' 
        });
    }
}
