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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const body = await req.json();

  const cliente_id = body.cliente_id as string;
  const contato_id = body.contato_id as string;
  const status = body.status as string;
  const observacoes = body.observacoes as string;
  const responsavel = body.responsavel as string;

  if (!cliente_id || !contato_id || !status || !responsavel) {
    return json(
      {
        error: "cliente_id, contato_id, status e responsavel são obrigatórios",
      },
      400,
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("cliente_contatos")
    .select("id")
    .eq("cliente_id", cliente_id)
    .eq("contato_id", contato_id)
    .maybeSingle();

  if (existingError) {
    return json({ error: existingError.message }, 500);
  }

  if (!existing) {
    const { error } = await supabase.from("cliente_contatos").insert({
      cliente_id,
      contato_id,
      status,
      observacoes,
      responsavel,
      sincronizado_em: new Date().toISOString(),
    });

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, acao: "criado" });
  }

  const { error } = await supabase
    .from("cliente_contatos")
    .update({
      status,
      observacoes,
      responsavel,
      sincronizado_em: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, acao: "atualizado" });
});
