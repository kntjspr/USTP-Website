import { createClient } from '@supabase/supabase-js';
import { rateLimit } from './_rate-limit.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

const DEPARTMENTS = [
    'Operations',
    'Technology',
    'Communications',
    'Community Development'
];

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function safeHref(s) {
    try {
        const u = new URL(String(s ?? ''));
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '#';
        return escHtml(u.toString());
    } catch {
        return '#';
    }
}

async function sendEmailNotification(registration) {
    if (!RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not configured, skipping email notification');
        return;
    }

    const isCoreteam = registration.registration_type === 'core_team';

    const emailHtml = `
        <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://gdgustp.com/devy-mail.png" alt="GDG USTP" style="max-width: 100%; height: auto; border-radius: 8px;" />
        </div>
        <h2>New ${isCoreteam ? 'Core Team' : 'Member'} Registration</h2>
        <p><strong>Name:</strong> ${escHtml(registration.full_name)}</p>
        <p><strong>Email:</strong> ${escHtml(registration.email)}</p>
        <p><strong>Student ID:</strong> ${escHtml(registration.student_id)}</p>
        <p><strong>Year Level:</strong> ${escHtml(registration.year_level)}</p>
        ${isCoreteam ? `
        <hr>
        <h3>Core Team Details</h3>
        <p><strong>Primary Department:</strong> ${escHtml(registration.primary_department)}</p>
        <p><strong>Secondary Department:</strong> ${escHtml(registration.secondary_department)}</p>
        <p><strong>CV Link:</strong> <a href="${safeHref(registration.cv_link)}">${escHtml(registration.cv_link)}</a></p>
        ${registration.github_link ? `<p><strong>GitHub:</strong> <a href="${safeHref(registration.github_link)}">${escHtml(registration.github_link)}</a></p>` : ''}
        <p><strong>About Themselves:</strong></p>
        <p>${escHtml(registration.about_yourself)}</p>
        ` : ''}
        <hr>
        <p><em>Submitted at ${new Date().toISOString()}</em></p>
    `;

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'GDG USTP <noreply@gdgustp.com>',
                to: ['gdsc@ustp.edu.ph'],
                subject: `New ${isCoreteam ? 'Core Team' : 'Member'} Registration: ${String(registration.full_name ?? '').replace(/[\r\n]+/g, ' ').slice(0, 120)}`,
                html: emailHtml
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Failed to send email:', error);
        }
    } catch (error) {
        console.error('Error sending email notification:', error);
    }
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST - submit new registration (anonymous, rate-limited)
    if (req.method === 'POST') {
        const limit = rateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'reg_post' });
        if (!limit(req, res).allowed) return;

        try {
            const {
                registration_type,
                full_name,
                email,
                student_id,
                year_level,
                primary_department,
                secondary_department,
                cv_link,
                github_link,
                about_yourself
            } = req.body;

            // validate required fields
            if (!registration_type || !['member', 'core_team'].includes(registration_type)) {
                return res.status(400).json({ error: 'Invalid registration type' });
            }

            if (!full_name || !email || !student_id || !year_level) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: 'Invalid email format' });
            }

            // core team specific validation
            if (registration_type === 'core_team') {
                if (!primary_department || !DEPARTMENTS.includes(primary_department)) {
                    return res.status(400).json({ error: 'Invalid primary department' });
                }
                if (!secondary_department || !DEPARTMENTS.includes(secondary_department)) {
                    return res.status(400).json({ error: 'Invalid secondary department' });
                }
                if (!cv_link) {
                    return res.status(400).json({ error: 'CV link is required for core team' });
                }
                if (!about_yourself) {
                    return res.status(400).json({ error: 'About yourself is required for core team' });
                }
            }

            // build registration data
            const registrationData = {
                registration_type,
                full_name: full_name.trim(),
                email: email.toLowerCase().trim(),
                student_id: student_id.trim(),
                year_level
            };

            if (registration_type === 'core_team') {
                registrationData.primary_department = primary_department;
                registrationData.secondary_department = secondary_department;
                registrationData.cv_link = cv_link.trim();
                registrationData.github_link = github_link?.trim() || null;
                registrationData.about_yourself = about_yourself.trim();
            }

            // insert into database (use admin client to bypass RLS)
            if (!supabaseAdmin) {
                return res.status(500).json({ error: 'Server configuration error' });
            }

            const { data, error } = await supabaseAdmin
                .from('registrations')
                .insert(registrationData)
                .select()
                .single();

            if (error) {
                console.error('Registration insert error:', error);
                return res.status(500).json({ error: 'Failed to submit registration' });
            }

            // send email notification (don't block response)
            sendEmailNotification(registrationData).catch(console.error);

            return res.status(201).json({
                success: true,
                message: 'Registration submitted successfully',
                data
            });

        } catch (error) {
            console.error('Registration error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // GET - fetch registrations (admin only)
    if (req.method === 'GET') {
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

        if (profileError || !profile || !['ADMIN', 'SYSTEM', 'EDITOR'].includes(profile.permission)) {
            return res.status(403).json({ error: 'Forbidden - Insufficient privileges' });
        }

        try {
            const typeFilter = req.query.type;

            let query = supabaseAdmin
                .from('registrations')
                .select('*')
                .order('created_at', { ascending: false });

            if (typeFilter && ['member', 'core_team'].includes(typeFilter)) {
                query = query.eq('registration_type', typeFilter);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Fetch registrations error:', error);
                return res.status(500).json({ error: 'Failed to fetch registrations' });
            }

            return res.status(200).json({ data });

        } catch (error) {
            console.error('Fetch error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
