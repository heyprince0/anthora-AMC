import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error, count } = await supabase
    .from('subscriptions')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('end_date', new Date().toISOString().split('T')[0]);

  if (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, expired: count });
}
