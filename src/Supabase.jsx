import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Helpful diagnostics in dev
if (!supabaseUrl || !supabaseKey) {
	console.error('[Supabase] Missing env vars. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env');
}

try {
	const host = new URL(supabaseUrl).host;
	if (!host.endsWith('.supabase.co')) {
		console.warn(`[Supabase] The URL host "${host}" does not look like a Supabase project URL (expected *.supabase.co)`);
	}
	console.log(`[Supabase] Using URL: ${supabaseUrl}`);
} catch (e) {
	console.warn('[Supabase] Invalid VITE_SUPABASE_URL. Please copy the exact Project URL from Supabase Dashboard > Settings > API.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase