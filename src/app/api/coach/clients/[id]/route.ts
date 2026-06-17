import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server credentials are not configured.');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Missing auth token.' }, { status: 401 });
    }

    const supabase = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'coach') {
      return NextResponse.json({ error: 'Only coaches can delete clients.' }, { status: 403 });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, full_name, email, user_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    const { error: deleteClientError } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId);

    if (deleteClientError) {
      return NextResponse.json({ error: deleteClientError.message }, { status: 500 });
    }

    if (client.user_id) {
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(client.user_id);

      if (deleteAuthError) {
        return NextResponse.json(
          {
            error: `Client data deleted, but auth access could not be removed: ${deleteAuthError.message}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      deleted: true,
      client_id: client.id,
      full_name: client.full_name,
      auth_user_removed: Boolean(client.user_id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown delete error.' },
      { status: 500 }
    );
  }
}
