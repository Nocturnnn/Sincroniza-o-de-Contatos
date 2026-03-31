import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";

type Contato = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
};

type Cliente = {
  id: string;
  nome: string;
  aba_padrao: string | null;
};

type ClienteContato = {
  id: string;
  cliente_id: string;
  contato_id: string;
  status: string | null;
  observacoes: string | null;
  responsavel: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);

  const [contatos, setContatos] = useState<Contato[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteContatos, setClienteContatos] = useState<ClienteContato[]>([]);

  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const [globalForm, setGlobalForm] = useState({
    nome: "",
    email: "",
    telefone: "",
  });

  const [localForm, setLocalForm] = useState({
    status: "",
    observacoes: "",
    responsavel: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return contatos;

    return contatos.filter((contato) => {
      return (
        (contato.nome ?? "").toLowerCase().includes(term) ||
        (contato.email ?? "").toLowerCase().includes(term) ||
        (contato.telefone ?? "").toLowerCase().includes(term)
      );
    });
  }, [contatos, search]);

  const selectedContact =
    contatos.find((contato) => contato.id === selectedContactId) ?? null;

  const contactOccurrences = useMemo(() => {
    return clienteContatos.filter(
      (item) => item.contato_id === selectedContactId,
    );
  }, [clienteContatos, selectedContactId]);

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function hydrateGlobalForm(contactId: string, sourceContacts = contatos) {
    const contact = sourceContacts.find((item) => item.id === contactId);

    setGlobalForm({
      nome: contact?.nome ?? "",
      email: contact?.email ?? "",
      telefone: contact?.telefone ?? "",
    });
  }

  function hydrateLocalForm(
    clientId: string,
    contactId: string,
    sourceRelationships = clienteContatos,
  ) {
    const relationship = sourceRelationships.find(
      (item) => item.cliente_id === clientId && item.contato_id === contactId,
    );

    setLocalForm({
      status: relationship?.status ?? "",
      observacoes: relationship?.observacoes ?? "",
      responsavel: relationship?.responsavel ?? "",
    });
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const [contatosRes, clientesRes, clienteContatosRes] = await Promise.all([
      supabase
        .from("contatos")
        .select("id, nome, email, telefone")
        .order("nome"),
      supabase
        .from("clientes")
        .select("id, nome, aba_padrao")
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("cliente_contatos")
        .select("id, cliente_id, contato_id, status, observacoes, responsavel")
        .order("criado_em", { ascending: true }),
    ]);

    if (contatosRes.error) {
      setError(`Erro ao carregar contatos: ${contatosRes.error.message}`);
      setLoading(false);
      return;
    }

    if (clientesRes.error) {
      setError(`Erro ao carregar clientes: ${clientesRes.error.message}`);
      setLoading(false);
      return;
    }

    if (clienteContatosRes.error) {
      setError(
        `Erro ao carregar vínculos: ${clienteContatosRes.error.message}`,
      );
      setLoading(false);
      return;
    }

    const contatosData = contatosRes.data ?? [];
    const clientesData = clientesRes.data ?? [];
    const clienteContatosData = clienteContatosRes.data ?? [];

    setContatos(contatosData);
    setClientes(clientesData);
    setClienteContatos(clienteContatosData);

    const nextContactId =
      selectedContactId || (contatosData.length > 0 ? contatosData[0].id : "");
    const nextClientId =
      selectedClientId || (clientesData.length > 0 ? clientesData[0].id : "");

    if (nextContactId && nextContactId !== selectedContactId) {
      setSelectedContactId(nextContactId);
    }

    if (nextClientId && nextClientId !== selectedClientId) {
      setSelectedClientId(nextClientId);
    }

    if (nextContactId) {
      const contact = contatosData.find((item) => item.id === nextContactId);
      setGlobalForm({
        nome: contact?.nome ?? "",
        email: contact?.email ?? "",
        telefone: contact?.telefone ?? "",
      });
    }

    if (nextClientId && nextContactId) {
      const relationship = clienteContatosData.find(
        (item) =>
          item.cliente_id === nextClientId && item.contato_id === nextContactId,
      );

      setLocalForm({
        status: relationship?.status ?? "",
        observacoes: relationship?.observacoes ?? "",
        responsavel: relationship?.responsavel ?? "",
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveGlobalContact() {
    clearFeedback();

    if (!selectedContact) {
      setError("Selecione um contato.");
      return;
    }

    const nome = globalForm.nome.trim();
    const email = globalForm.email.trim();
    const telefone = globalForm.telefone.trim();

    if (!nome || !email || !telefone) {
      setError("Preencha nome, email e telefone.");
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(telefone);

    const duplicate = contatos.find((contato) => {
      if (contato.id === selectedContact.id) return false;

      return (
        normalizeEmail(contato.email ?? "") === normalizedEmail ||
        normalizePhone(contato.telefone ?? "") === normalizedPhone
      );
    });

    if (duplicate) {
      setError(
        `Possível duplicado encontrado: ${duplicate.nome} (${duplicate.email}).`,
      );
      return;
    }

    setSavingGlobal(true);

    const { error } = await supabase.functions.invoke(
      "atualizar-contato-global",
      {
        body: {
          contato_id: selectedContact.id,
          nome,
          email,
          telefone,
        },
      },
    );

    setSavingGlobal(false);

    if (error) {
      setError(`Erro ao atualizar contato global: ${error.message}`);
      return;
    }

    await loadData();
    setMessage(
      "Contato global atualizado com sucesso. Email e telefone foram refletidos nas visões locais.",
    );
  }

  async function handleSaveLocalRelationship() {
    clearFeedback();

    if (!selectedContactId || !selectedClientId) {
      setError("Selecione um cliente e um contato.");
      return;
    }

    const status = localForm.status.trim();
    const observacoes = localForm.observacoes.trim();
    const responsavel = localForm.responsavel.trim();

    if (!status || !responsavel) {
      setError("Preencha status e responsável.");
      return;
    }

    setSavingLocal(true);

    const { error } = await supabase.functions.invoke(
      "atualizar-vinculo-cliente",
      {
        body: {
          cliente_id: selectedClientId,
          contato_id: selectedContactId,
          status,
          observacoes,
          responsavel,
        },
      },
    );

    setSavingLocal(false);

    if (error) {
      setError(`Erro ao atualizar vínculo local: ${error.message}`);
      return;
    }

    await loadData();
    setMessage(
      "Vínculo local atualizado com sucesso. O status foi alterado apenas para este cliente.",
    );
  }

  const selectedClientName =
    clientes.find((client) => client.id === selectedClientId)?.nome ??
    "Cliente";

  if (loading) {
    return (
      <div className="app-shell single-state">
        <div className="state-card">
          <h2>Carregando sistema...</h2>
          <p>Buscando contatos, clientes e vínculos no Supabase.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="eyebrow">Painel operacional</span>
          <h1>Contact Sync Manager</h1>
          <p>
            Interface simples para equipe não técnica editar dados globais e
            dados locais por cliente.
          </p>
        </div>

        <div className="search-card">
          <label htmlFor="search">Buscar contato</label>
          <input
            id="search"
            type="text"
            placeholder="Nome, email ou telefone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="contact-list">
          {filteredContacts.map((contact) => (
            <button
              key={contact.id}
              className={`contact-item ${
                selectedContactId === contact.id ? "active" : ""
              }`}
              onClick={() => {
                setSelectedContactId(contact.id);
                hydrateGlobalForm(contact.id);
                hydrateLocalForm(selectedClientId, contact.id);
                clearFeedback();
              }}
            >
              <strong>{contact.nome}</strong>
              <span>{contact.email}</span>
              <small>{contact.telefone}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-content">
        <section className="top-grid">
          <article className="stat-card">
            <span>Total de contatos</span>
            <strong>{contatos.length}</strong>
          </article>

          <article className="stat-card">
            <span>Total de clientes</span>
            <strong>{clientes.length}</strong>
          </article>

          <article className="stat-card">
            <span>Ocorrências do contato</span>
            <strong>{contactOccurrences.length}</strong>
          </article>
        </section>

        {message && <div className="feedback success">{message}</div>}
        {error && <div className="feedback error">{error}</div>}

        <section className="panel-grid">
          <article className="panel">
            <div className="panel-header">
              <span className="eyebrow">Camada global</span>
              <h2>Contato principal</h2>
            </div>

            {selectedContact ? (
              <div className="form-grid">
                <div className="field">
                  <label>ID do contato</label>
                  <input value={selectedContact.id} disabled />
                </div>

                <div className="field">
                  <label>Nome</label>
                  <input
                    value={globalForm.nome}
                    onChange={(e) =>
                      setGlobalForm((prev) => ({
                        ...prev,
                        nome: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="field">
                  <label>Email</label>
                  <input
                    value={globalForm.email}
                    onChange={(e) =>
                      setGlobalForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="field">
                  <label>Telefone</label>
                  <input
                    value={globalForm.telefone}
                    onChange={(e) =>
                      setGlobalForm((prev) => ({
                        ...prev,
                        telefone: e.target.value,
                      }))
                    }
                  />
                </div>

                <button
                  className="primary-button"
                  type="button"
                  onClick={handleSaveGlobalContact}
                  disabled={savingGlobal}
                >
                  {savingGlobal ? "Salvando..." : "Salvar contato global"}
                </button>
              </div>
            ) : (
              <p>Nenhum contato selecionado.</p>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <span className="eyebrow">Camada local</span>
              <h2>Relacionamento por cliente</h2>
            </div>

            <div className="field">
              <label>Cliente</label>
              <select
                value={selectedClientId}
                onChange={(event) => {
                  const nextClientId = event.target.value;
                  setSelectedClientId(nextClientId);
                  hydrateLocalForm(nextClientId, selectedContactId);
                  clearFeedback();
                }}
              >
                {clientes.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Status</label>
                <input
                  value={localForm.status}
                  onChange={(e) =>
                    setLocalForm((prev) => ({
                      ...prev,
                      status: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label>Observações</label>
                <textarea
                  rows={4}
                  value={localForm.observacoes}
                  onChange={(e) =>
                    setLocalForm((prev) => ({
                      ...prev,
                      observacoes: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label>Responsável</label>
                <input
                  value={localForm.responsavel}
                  onChange={(e) =>
                    setLocalForm((prev) => ({
                      ...prev,
                      responsavel: e.target.value,
                    }))
                  }
                />
              </div>

              <button
                className="primary-button"
                type="button"
                onClick={handleSaveLocalRelationship}
                disabled={savingLocal}
              >
                {savingLocal ? "Salvando..." : "Salvar vínculo local"}
              </button>
            </div>
          </article>
        </section>

        <section className="panel-grid">
          <article className="panel">
            <div className="panel-header">
              <span className="eyebrow">Fonte de verdade</span>
              <h2>Banco principal</h2>
            </div>

            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Telefone</th>
                  </tr>
                </thead>
                <tbody>
                  {contatos.map((contact) => (
                    <tr
                      key={contact.id}
                      className={
                        selectedContactId === contact.id ? "highlight-row" : ""
                      }
                    >
                      <td>{contact.id}</td>
                      <td>{contact.nome}</td>
                      <td>{contact.email}</td>
                      <td>{contact.telefone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <span className="eyebrow">Impacto local</span>
              <h2>Onde esse contato aparece</h2>
            </div>

            <div className="relation-list">
              {contactOccurrences.length > 0 ? (
                contactOccurrences.map((item) => {
                  const client = clientes.find((c) => c.id === item.cliente_id);
                  return (
                    <div className="relation-card" key={item.id}>
                      <strong>{client?.nome}</strong>
                      <span>Status: {item.status}</span>
                      <span>Responsável: {item.responsavel}</span>
                      <small>{item.observacoes || "Sem observações"}</small>
                    </div>
                  );
                })
              ) : (
                <p>Esse contato ainda não está vinculado a nenhum cliente.</p>
              )}
            </div>
          </article>
        </section>

        <section className="panel">
          <div className="panel-header">
            <span className="eyebrow">Planilhas por cliente</span>
            <h2>Visões locais do sistema</h2>
          </div>

          <div className="sheets-grid">
            {clientes.map((client) => {
              const rows = clienteContatos
                .filter((item) => item.cliente_id === client.id)
                .map((item) => {
                  const contact = contatos.find(
                    (c) => c.id === item.contato_id,
                  );
                  return { ...item, contact };
                });

              return (
                <div className="sheet-card" key={client.id}>
                  <div className="sheet-header">
                    <strong>{client.nome}</strong>
                    <span>{client.aba_padrao ?? "-"}</span>
                  </div>

                  <div className="table-shell compact">
                    <table>
                      <thead>
                        <tr>
                          <th>Contato</th>
                          <th>Email</th>
                          <th>Telefone</th>
                          <th>Status local</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            className={
                              row.contato_id === selectedContactId
                                ? "highlight-row"
                                : ""
                            }
                          >
                            <td>{row.contact?.nome ?? "-"}</td>
                            <td>{row.contact?.email ?? "-"}</td>
                            <td>{row.contact?.telefone ?? "-"}</td>
                            <td>{row.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="summary-box">
          <h3>Como essa estrutura resolve o problema</h3>
          <ul>
            <li>
              <strong>Contato</strong> é o registro central com email e
              telefone.
            </li>
            <li>
              <strong>Cliente</strong> é o contexto de cada planilha.
            </li>
            <li>
              <strong>Status</strong> pertence ao vínculo entre cliente e
              contato.
            </li>
            <li>
              Atualizar email ou telefone reflete em todas as visões locais sem
              sobrescrever o status por cliente.
            </li>
          </ul>

          {selectedContact && (
            <p className="selected-summary">
              Exemplo atual: ao editar <strong>{selectedContact.nome}</strong>{" "}
              no bloco global, todas as planilhas passam a mostrar o novo email
              e telefone. Já o status em <strong>{selectedClientName}</strong>{" "}
              continua local.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
