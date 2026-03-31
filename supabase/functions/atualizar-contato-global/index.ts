import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function normalizeEmail(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function normalizePhone(value?: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\D/g, "");
  return normalized.length ? normalized : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const n8nWebhookUrl = Deno.env.get("N8N_SYNC_CONTACT_WEBHOOK_URL");
    const n8nWebhookSecret = Deno.env.get("N8N_SYNC_CONTACT_WEBHOOK_SECRET");

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500,
      );
    }

    if (!n8nWebhookUrl) {
      return json({ error: "Missing N8N_SYNC_CONTACT_WEBHOOK_URL" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();

    const contato_id = body.contato_id as string;
    const nome = (body.nome as string | undefined)?.trim() || "";
    const email = (body.email as string | undefined)?.trim() || "";
    const telefone = (body.telefone as string | undefined)?.trim() || "";

    if (!contato_id || !nome || !email || !telefone) {
      return json(
        { error: "contato_id, nome, email e telefone são obrigatórios" },
        400,
      );
    }

    const email_normalizado = normalizeEmail(email);
    const telefone_normalizado = normalizePhone(telefone);

    const { data: duplicateByEmail, error: duplicateEmailError } =
      await supabase
        .from("contatos")
        .select("id, nome, email")
        .eq("email_normalizado", email_normalizado)
        .neq("id", contato_id)
        .maybeSingle();

    if (duplicateEmailError) {
      return json({ error: duplicateEmailError.message }, 500);
    }

    if (duplicateByEmail) {
      return json(
        {
          error: `Email já está em uso por outro contato: ${duplicateByEmail.nome}`,
        },
        409,
      );
    }

    const { data: duplicateByPhone, error: duplicatePhoneError } =
      await supabase
        .from("contatos")
        .select("id, nome, telefone")
        .eq("telefone_normalizado", telefone_normalizado)
        .neq("id", contato_id)
        .maybeSingle();

    if (duplicatePhoneError) {
      return json({ error: duplicatePhoneError.message }, 500);
    }

    if (duplicateByPhone) {
      return json(
        {
          error: `Telefone já está em uso por outro contato: ${duplicateByPhone.nome}`,
        },
        409,
      );
    }

    const { error: updateError } = await supabase
      .from("contatos")
      .update({
        nome,
        email,
        telefone,
      })
      .eq("id", contato_id);

    if (updateError) {
      return json({ error: updateError.message }, 500);
    }

    const webhookPayload = {
      contato_id,
      origem: "atualizacao_global",
      triggered_at: new Date().toISOString(),
    };

    const webhookHeaders: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (n8nWebhookSecret) {
      webhookHeaders["x-webhook-secret"] = n8nWebhookSecret;
    }

    const webhookResponse = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: webhookHeaders,
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookResponse.ok) {
      const webhookText = await webhookResponse.text();

      return json(
        {
          error: "Contato atualizado, mas falhou ao acionar o webhook do n8n.",
          webhook_status: webhookResponse.status,
          webhook_response: webhookText,
        },
        502,
      );
    }

    let webhookResult: unknown = null;

    try {
      webhookResult = await webhookResponse.json();
    } catch {
      webhookResult = { ok: true };
    }

    return json({
      ok: true,
      contato_id,
      webhook_disparado: true,
      webhook_result: webhookResult,
    });
  } catch (error) {
    return json(
      {
        error: "Unexpected error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
