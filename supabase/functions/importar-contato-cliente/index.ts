import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Payload = {
  cliente_id: string;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  status?: string | null;
  observacoes?: string | null;
  responsavel?: string | null;
  linha_planilha?: string | null;
};

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200, withCors = false) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(withCors ? corsHeaders : {}),
    },
  });
}

function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\D/g, "");
  return normalized.length ? normalized : null;
}

async function insertConflict(
  supabase: SupabaseClient,
  params: {
    cliente_id: string;
    contato_id?: string | null;
    linha_planilha?: string | null;
    tipo_conflito: string;
    mensagem: string;
    payload: Json;
  },
) {
  const { error } = await supabase
    .from("conflitos_importacao_contatos")
    .insert({
      cliente_id: params.cliente_id,
      contato_id: params.contato_id ?? null,
      linha_planilha: params.linha_planilha ?? null,
      tipo_conflito: params.tipo_conflito,
      mensagem: params.mensagem,
      payload: params.payload,
    });

  if (error) {
    console.error("Erro ao registrar conflito:", error);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, true);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500,
        true,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as Payload;

    const cliente_id = body.cliente_id;
    const nome = body.nome?.trim() || null;
    const email = body.email?.trim() || null;
    const telefone = body.telefone?.trim() || null;
    const status = body.status?.trim() || null;
    const observacoes = body.observacoes?.trim() || null;
    const responsavel = body.responsavel?.trim() || null;
    const linha_planilha = body.linha_planilha?.toString() || null;

    if (!cliente_id) {
      return json({ error: "cliente_id is required" }, 400, true);
    }

    const email_normalizado = normalizeEmail(email);
    const telefone_normalizado = normalizePhone(telefone);

    if (!email_normalizado && !telefone_normalizado) {
      await insertConflict(supabase, {
        cliente_id,
        linha_planilha,
        tipo_conflito: "sem_identificador",
        mensagem: "Linha sem email e sem telefone.",
        payload: {
          nome,
          email,
          telefone,
          status,
          observacoes,
          responsavel,
        },
      });

      return json(
        {
          contato_id: null,
          cliente_contato_id: null,
          acao: "conflito_sem_identificador",
          conflito: true,
        },
        200,
        true,
      );
    }

    let conflito = false;
    let contatoExistente: Record<string, unknown> | null = null;

    if (email_normalizado) {
      const { data, error } = await supabase
        .from("contatos")
        .select("*")
        .eq("email_normalizado", email_normalizado)
        .limit(1)
        .maybeSingle();

      if (error) {
        return json(
          { error: "Erro ao buscar contato por email", details: error },
          500,
          true,
        );
      }

      contatoExistente = data;
    }

    if (!contatoExistente && telefone_normalizado) {
      const { data, error } = await supabase
        .from("contatos")
        .select("*")
        .eq("telefone_normalizado", telefone_normalizado)
        .limit(1)
        .maybeSingle();

      if (error) {
        return json(
          { error: "Erro ao buscar contato por telefone", details: error },
          500,
          true,
        );
      }

      contatoExistente = data;
    }

    let contato_id: string;

    if (!contatoExistente) {
      const { data, error } = await supabase
        .from("contatos")
        .insert({
          nome,
          email,
          telefone,
          origem: "importacao_planilha",
        })
        .select("id")
        .single();

      if (error || !data) {
        return json(
          { error: "Erro ao criar contato", details: error },
          500,
          true,
        );
      }

      contato_id = data.id;
    } else {
      contato_id = String(contatoExistente.id);

      const updatesContato: Record<string, string> = {};

      const emailAtual = contatoExistente.email as string | null;
      const telefoneAtual = contatoExistente.telefone as string | null;
      const nomeAtual = contatoExistente.nome as string | null;

      if (!emailAtual && email) {
        updatesContato.email = email;
      } else if (
        email &&
        emailAtual &&
        normalizeEmail(emailAtual) !== email_normalizado
      ) {
        conflito = true;
        await insertConflict(supabase, {
          cliente_id,
          contato_id,
          linha_planilha,
          tipo_conflito: "email_conflitante",
          mensagem: "Contato encontrado, mas com email diferente do já salvo.",
          payload: {
            email_atual: emailAtual,
            email_recebido: email,
            nome_recebido: nome,
          },
        });
      }

      if (!telefoneAtual && telefone) {
        updatesContato.telefone = telefone;
      } else if (
        telefone &&
        telefoneAtual &&
        normalizePhone(telefoneAtual) !== telefone_normalizado
      ) {
        conflito = true;
        await insertConflict(supabase, {
          cliente_id,
          contato_id,
          linha_planilha,
          tipo_conflito: "telefone_conflitante",
          mensagem:
            "Contato encontrado, mas com telefone diferente do já salvo.",
          payload: {
            telefone_atual: telefoneAtual,
            telefone_recebido: telefone,
            nome_recebido: nome,
          },
        });
      }

      if (!nomeAtual && nome) {
        updatesContato.nome = nome;
      }

      if (Object.keys(updatesContato).length > 0) {
        const { error } = await supabase
          .from("contatos")
          .update(updatesContato)
          .eq("id", contato_id);

        if (error) {
          return json(
            { error: "Erro ao atualizar contato", details: error },
            500,
            true,
          );
        }
      }
    }

    const { data: clienteContatoExistente, error: clienteContatoError } =
      await supabase
        .from("cliente_contatos")
        .select("id")
        .eq("cliente_id", cliente_id)
        .eq("contato_id", contato_id)
        .limit(1)
        .maybeSingle();

    if (clienteContatoError) {
      return json(
        {
          error: "Erro ao buscar vínculo cliente_contatos",
          details: clienteContatoError,
        },
        500,
        true,
      );
    }

    let cliente_contato_id: string;
    let acao: "criado" | "atualizado";

    if (!clienteContatoExistente) {
      const { data, error } = await supabase
        .from("cliente_contatos")
        .insert({
          cliente_id,
          contato_id,
          status,
          observacoes,
          responsavel,
          linha_planilha,
          sincronizado_em: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error || !data) {
        return json(
          { error: "Erro ao criar vínculo cliente_contatos", details: error },
          500,
          true,
        );
      }

      cliente_contato_id = data.id;
      acao = "criado";
    } else {
      cliente_contato_id = clienteContatoExistente.id;

      const updatePayload: Record<string, string> = {
        sincronizado_em: new Date().toISOString(),
      };

      if (status) updatePayload.status = status;
      if (observacoes) updatePayload.observacoes = observacoes;
      if (responsavel) updatePayload.responsavel = responsavel;
      if (linha_planilha) updatePayload.linha_planilha = linha_planilha;

      const { error } = await supabase
        .from("cliente_contatos")
        .update(updatePayload)
        .eq("id", cliente_contato_id);

      if (error) {
        return json(
          {
            error: "Erro ao atualizar vínculo cliente_contatos",
            details: error,
          },
          500,
          true,
        );
      }

      acao = "atualizado";
    }

    return json(
      {
        contato_id,
        cliente_contato_id,
        acao,
        conflito,
      },
      200,
      true,
    );
  } catch (error) {
    console.error("Erro inesperado na function:", error);
    return json(
      {
        error: "Unexpected error",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
      true,
    );
  }
});
