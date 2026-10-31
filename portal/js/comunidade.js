
/* ============================================================
   COJURIS — COMUNIDADE PROFISSIONAL

   ARQUIVO: portal/js/comunidade.js

   01 — Importações do Firebase
   02 — Elementos do HTML
   03 — Estado da aplicação
   04 — Apresentação e acesso
   05 — Identificação administrativa
   06 — Classificação do interessado
   07 — Criação segura de elementos
   08 — Formatação de datas
   09 — Montagem dos comunicados
   10 — Consulta paginada ao Firestore
   11 — Autenticação
   12 — Eventos
   13 — Sincronização das notificações dispensadas

   A coleção "comunicados" é compartilhada com
   portal/comunicados.html.

   A página da comunidade faz somente leituras.

   IMPLEMENTAÇÃO ADICIONAL:
   Os comunicados dispensados no sino deixam de
   aparecer para o usuário autenticado.

   Nenhum comunicado é excluído do Firebase.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit,
    startAfter,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS DO HTML
// ============================================================

const aplicativo = document.getElementById(
    "comunidade-app"
);

const telaAcesso = document.getElementById(
    "comunidade-acesso"
);

const mensagemAcesso = document.getElementById(
    "comunidade-mensagem"
);

const indicadorPerfil = document.getElementById(
    "comunidade-perfil"
);

const avisoLeitura = document.getElementById(
    "aviso-modo-leitura"
);

const listaComunicados = document.getElementById(
    "comunidade-lista-comunicados"
);

const mensagemComunicados = document.getElementById(
    "comunicados-mensagem"
);

const btnAtualizar = document.getElementById(
    "comunidade-atualizar"
);

const btnCarregarMais = document.getElementById(
    "comunidade-carregar-mais"
);

const areaGerenciamento = document.getElementById(
    "comunidade-gerenciar"
);


// ============================================================
// 03 — ESTADO DA APLICAÇÃO
//
// Controla as consultas ao banco e a paginação.
// ============================================================

const TAMANHO_PAGINA = 5;

let perfilAtual = null;

let ultimoDocumento = null;

let carregando = false;

let terminouListagem = false;

let totalExibido = 0;

// Usado para ignorar respostas de consultas anteriores
// quando ocorre alteração da sessão ou atualização.

let versaoSessao = 0;

// Identifica a requisição de listagem mais recente.
let versaoListagem = 0;


// ============================================================
// 03.1 — NOTIFICAÇÕES DISPENSADAS
//
// NOVA IMPLEMENTAÇÃO
//
// Caminho:
// leituras_comunicados/{uid}/itens/{comunicadoId}
//
// Somente os registros com dispensadoEm são ocultados.
//
// Não há exclusão ou alteração do comunicado original.
// ============================================================

let idsDispensados = new Set();

let cancelarObservadorDispensas = null;

let dispensasCarregadas = false;


// ============================================================
// 04 — APRESENTAÇÃO E CONTROLE DE ACESSO
// ============================================================

function mostrarMensagemAcesso(texto) {

    aplicativo.hidden = true;

    telaAcesso.hidden = false;

    mensagemAcesso.textContent = texto;
}


function limparComunicados() {

    listaComunicados.replaceChildren();

    ultimoDocumento = null;

    terminouListagem = false;

    totalExibido = 0;

    btnCarregarMais.hidden = true;

    btnCarregarMais.disabled = true;
}


// Esta função não altera as regras do Firestore.
// Apenas adapta a interface ao perfil identificado.

function liberarPagina(perfil) {

    perfilAtual = perfil;

    document.body.dataset.perfilComunidade = perfil;

    const nomes = {
        administrador: "Administração",
        participante: "Participante verificado",
        leitor: "Modo leitura"
    };

    indicadorPerfil.textContent =
        nomes[perfil] || "Comunidade";

    avisoLeitura.hidden = perfil !== "leitor";

    areaGerenciamento.hidden =
        perfil !== "administrador";

    telaAcesso.hidden = true;

    aplicativo.hidden = false;

    btnAtualizar.disabled = false;
}


// ============================================================
// 04.1 — ATUALIZAR CONTADOR VISUAL
// ============================================================

function atualizarQuantidadeComunicados() {

    if (totalExibido === 0) {

        mensagemComunicados.textContent =
            terminouListagem
                ? "Não há comunicados na sua lista."
                : "Nenhum comunicado exibido nesta página. " +
                  "Você pode carregar mais.";

        return;
    }

    mensagemComunicados.textContent =
        `${totalExibido} comunicado(s) exibido(s).`;
}


// ============================================================
// 05 — IDENTIFICAÇÃO ADMINISTRATIVA
//
// Consulta somente o documento do usuário
// autenticado na coleção administradores.
// ============================================================

async function ehAdministrador(usuario) {

    const referencia = doc(
        db,
        "administradores",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    return (
        resultado.exists() &&
        resultado.data().ativo === true
    );
}


// ============================================================
// 06 — CLASSIFICAÇÃO DE PERMISSÕES
//
// Administrador:
//   acesso administrativo.
//
// Participante:
//   aprovado e profissionalmente verificado.
//
// Leitor:
//   cadastro pendente ou aprovado sem verificação.
//
// Rejeitado:
//   não autorizado.
// ============================================================

async function identificarPerfil(usuario) {

    if (await ehAdministrador(usuario)) {

        return "administrador";
    }

    const referencia = doc(
        db,
        "interessados",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    if (!resultado.exists()) {

        return "sem_cadastro";
    }

    const dados = resultado.data();

    if (dados.status === "rejeitado") {

        return "rejeitado";
    }

    if (
        dados.status === "aprovado" &&
        dados.verificacaoProfissional === "verificada"
    ) {

        return "participante";
    }

    if (
        dados.status === "pendente" ||
        dados.status === "aprovado"
    ) {

        return "leitor";
    }

    return "sem_permissao";
}


// ============================================================
// 07 — CONSTRUÇÃO SEGURA DE ELEMENTOS
//
// textContent apresenta o conteúdo como texto,
// sem interpretá-lo como HTML ou JavaScript.
//
// Isso é importante para textos obtidos do Firestore.
// ============================================================

function criarElemento(tag, classe, texto) {

    const elemento = document.createElement(tag);

    if (classe) {

        elemento.className = classe;
    }

    if (texto !== undefined) {

        elemento.textContent = String(texto);
    }

    return elemento;
}


// ============================================================
// 08 — FORMATAÇÃO DE DATAS
// ============================================================

function formatarData(timestamp) {

    if (
        !timestamp ||
        typeof timestamp.toDate !== "function"
    ) {

        return "Comunicado institucional";
    }

    const data = timestamp.toDate();

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "long",
            timeStyle: "short"
        }
    ).format(data);
}


// ============================================================
// 09 — CRIAÇÃO DO CARTÃO DE COMUNICADO
//
// Mantemos as classes que já existem no CSS:
//
// post-card
// post-header
// post-avatar
// post-author
// content-tag
// post-footer
//
// Dessa forma, conservamos o design original.
// ============================================================

function criarCartaoComunicado(documento) {

    const dados = documento.data();

    // --------------------------------------------
    // 09.1 — CARTÃO PRINCIPAL
    // --------------------------------------------

    const cartao = criarElemento(
        "article",
        "post-card"
    );

    // NOVO:
    // Permite localizar o cartão quando sua
    // notificação for dispensada no sino.

    cartao.dataset.comunicadoId = documento.id;

    // --------------------------------------------
    // 09.2 — CABEÇALHO
    // --------------------------------------------

    const cabecalho = criarElemento(
        "div",
        "post-header"
    );

    const avatar = criarElemento(
        "span",
        "post-avatar",
        "✦"
    );

    avatar.setAttribute("aria-hidden", "true");

    const identificacao = criarElemento(
        "div",
        "post-author"
    );

    const autor = criarElemento(
        "strong",
        "",
        "COJURIS"
    );

    const dataTexto = formatarData(
        dados.publicadoEm
    );

    const data = criarElemento(
        "time",
        "",
        dataTexto
    );

    if (
        dados.publicadoEm &&
        typeof dados.publicadoEm.toDate === "function"
    ) {

        data.dateTime =
            dados.publicadoEm.toDate().toISOString();
    }

    identificacao.append(
        autor,
        data
    );

    cabecalho.append(
        avatar,
        identificacao
    );

    // --------------------------------------------
    // 09.3 — IDENTIFICAÇÃO INSTITUCIONAL
    // --------------------------------------------

    const categoria = criarElemento(
        "span",
        "content-tag",
        "Institucional"
    );

    // --------------------------------------------
    // 09.4 — TÍTULO E CONTEÚDO
    // --------------------------------------------

    const titulo = criarElemento(
        "h3",
        "",
        dados.titulo || "Comunicado"
    );

    const conteudo = criarElemento(
        "p",
        "comunidade-post-conteudo",
        dados.conteudo || ""
    );

    // --------------------------------------------
    // 09.5 — RODAPÉ
    // --------------------------------------------

    const rodape = criarElemento(
        "div",
        "post-footer"
    );

    const identificacaoRodape = criarElemento(
        "span",
        "",
        "Comunicado oficial"
    );

    const simbolo = criarElemento(
        "span",
        "",
        "✦"
    );

    simbolo.setAttribute("aria-hidden", "true");

    rodape.append(
        identificacaoRodape,
        simbolo
    );

    // --------------------------------------------
    // 09.6 — MONTAGEM FINAL
    // --------------------------------------------

    cartao.append(
        cabecalho,
        categoria,
        titulo,
        conteudo,
        rodape
    );

    return cartao;
}


// ============================================================
// 10 — CONSULTA PAGINADA AO FIRESTORE
//
// Ordena os comunicados por publicadoEm,
// exibindo os mais recentes primeiro.
//
// A coleção possui as mesmas regras utilizadas
// por comunicados.html.
//
// Carregamos cinco documentos por consulta.
//
// IMPORTANTE:
// O cursor considera TODOS os documentos retornados,
// inclusive os que foram dispensados pelo usuário.
// ============================================================

async function carregarComunicados(reiniciar = false) {

    if (
        !perfilAtual ||
        carregando ||
        !dispensasCarregadas
    ) {

        return;
    }

    const sessaoDaConsulta = versaoSessao;

    const requisicaoAtual = ++versaoListagem;

    carregando = true;

    btnAtualizar.disabled = true;

    btnCarregarMais.disabled = true;

    if (reiniciar) {

        limparComunicados();
    }

    mensagemComunicados.textContent =
        "Carregando comunicados...";

    try {

        const referencia = collection(
            db,
            "comunicados"
        );

        let consulta;

        // --------------------------------------------
        // 10.1 — PRIMEIRA PÁGINA OU PÁGINA SEGUINTE
        // --------------------------------------------

        if (ultimoDocumento) {

            consulta = query(
                referencia,
                orderBy("publicadoEm", "desc"),
                startAfter(ultimoDocumento),
                limit(TAMANHO_PAGINA)
            );

        } else {

            consulta = query(
                referencia,
                orderBy("publicadoEm", "desc"),
                limit(TAMANHO_PAGINA)
            );
        }

        // --------------------------------------------
        // 10.2 — CONSULTA REAL
        // --------------------------------------------

        const resultado = await getDocs(consulta);

        if (
            sessaoDaConsulta !== versaoSessao ||
            requisicaoAtual !== versaoListagem
        ) {

            return;
        }

        // --------------------------------------------
        // 10.3 — INSERÇÃO DOS CARTÕES
        //
        // NOVO:
        // Não mostra os IDs que já possuem
        // dispensadoEm no histórico pessoal.
        // --------------------------------------------

        const fragmento =
            document.createDocumentFragment();

        resultado.forEach(documento => {

            if (idsDispensados.has(documento.id)) {
                return;
            }

            fragmento.appendChild(
                criarCartaoComunicado(documento)
            );

            totalExibido++;
        });

        listaComunicados.appendChild(fragmento);

        // --------------------------------------------
        // 10.4 — CURSOR DE PAGINAÇÃO
        //
        // Preserva a paginação original.
        //
        // Não utiliza a quantidade de cartões visíveis
        // para decidir se existem mais páginas.
        // --------------------------------------------

        if (!resultado.empty) {

            ultimoDocumento =
                resultado.docs[resultado.docs.length - 1];
        }

        terminouListagem =
            resultado.size < TAMANHO_PAGINA;

        btnCarregarMais.hidden = terminouListagem;

        // --------------------------------------------
        // 10.5 — MENSAGEM AO USUÁRIO
        // --------------------------------------------

        atualizarQuantidadeComunicados();

    } catch (erro) {

        if (
            sessaoDaConsulta !== versaoSessao ||
            requisicaoAtual !== versaoListagem
        ) {

            return;
        }

        console.error(
            "COJURIS — Consulta de comunicados:",
            erro.code || erro.message
        );

        mensagemComunicados.textContent =
            "Não foi possível carregar os comunicados. " +
            "Utilize Atualizar comunicados para tentar novamente.";

    } finally {

        if (
            sessaoDaConsulta === versaoSessao &&
            requisicaoAtual === versaoListagem
        ) {

            carregando = false;

            btnAtualizar.disabled = false;

            btnCarregarMais.disabled =
                terminouListagem;
        }
    }
}


// ============================================================
// 13 — SINCRONIZAÇÃO DAS DISPENSAS
//
// NOVA IMPLEMENTAÇÃO
//
// Observa os documentos individuais do usuário.
//
// Quando o sino registra dispensadoEm,
// o cartão correspondente desaparece da comunidade.
//
// Não altera os comunicados originais.
// ============================================================

function sincronizarCartoesDispensados() {

    const cartoes = listaComunicados.querySelectorAll(
        "[data-comunicado-id]"
    );

    let houveRemocao = false;

    cartoes.forEach(cartao => {

        const id = cartao.dataset.comunicadoId;

        if (idsDispensados.has(id)) {

            cartao.remove();

            totalExibido = Math.max(
                0,
                totalExibido - 1
            );

            houveRemocao = true;
        }
    });

    if (houveRemocao && !carregando) {
        atualizarQuantidadeComunicados();
    }
}


// ------------------------------------------------------------
// PRIMEIRA CONSULTA E ATUALIZAÇÕES EM TEMPO REAL
//
// A primeira resposta precisa chegar antes da
// primeira listagem para evitar que comunicados
// dispensados apareçam temporariamente.
// ------------------------------------------------------------

function acompanharDispensas(usuario, sessaoAtual) {

    return new Promise((resolver, rejeitar) => {

        let primeiraResposta = true;

        const referencia = collection(
            db,
            "leituras_comunicados",
            usuario.uid,
            "itens"
        );

        cancelarObservadorDispensas = onSnapshot(

            referencia,

            resultado => {

                if (sessaoAtual !== versaoSessao) {
                    return;
                }

                idsDispensados = new Set(
                    resultado.docs
                        .filter(documento =>
                            documento.data().dispensadoEm != null
                        )
                        .map(documento => documento.id)
                );

                dispensasCarregadas = true;

                sincronizarCartoesDispensados();

                if (primeiraResposta) {

                    primeiraResposta = false;

                    resolver();
                }
            },

            erro => {

                if (sessaoAtual !== versaoSessao) {
                    return;
                }

                console.error(
                    "COJURIS — Consulta de dispensas:",
                    erro.code || erro.message
                );

                dispensasCarregadas = false;

                if (primeiraResposta) {

                    primeiraResposta = false;

                    rejeitar(erro);

                } else {

                    mensagemComunicados.textContent =
                        "Não foi possível sincronizar as " +
                        "notificações dispensadas.";
                }
            }
        );
    });
}


// ============================================================
// 11 — OBSERVADOR DE AUTENTICAÇÃO
//
// Mantém o mesmo controle de segurança anterior.
//
// A listagem somente é iniciada após verificar
// as permissões do usuário.
// ============================================================

mostrarMensagemAcesso(
    "Verificando sua autorização..."
);

onAuthStateChanged(

    auth,

    async usuario => {

        versaoSessao++;

        // Encerrar consultas da sessão anterior.

        if (cancelarObservadorDispensas) {

            cancelarObservadorDispensas();

            cancelarObservadorDispensas = null;
        }

        idsDispensados = new Set();

        dispensasCarregadas = false;

        versaoListagem++;

        carregando = false;

        perfilAtual = null;

        aplicativo.hidden = true;

        btnAtualizar.disabled = true;

        btnCarregarMais.disabled = true;

        limparComunicados();

        if (!usuario) {

            window.location.replace("./index.html");

            return;
        }

        mostrarMensagemAcesso(
            "Verificando sua autorização..."
        );

        const sessaoAtual = versaoSessao;

        try {

            const perfil = await identificarPerfil(
                usuario
            );

            if (sessaoAtual !== versaoSessao) {
                return;
            }

            if (
                perfil === "administrador" ||
                perfil === "participante" ||
                perfil === "leitor"
            ) {

                liberarPagina(perfil);

                // NOVO:
                // Consultar as dispensas individuais
                // antes da primeira página.

                await acompanharDispensas(
                    usuario,
                    sessaoAtual
                );

                if (sessaoAtual !== versaoSessao) {
                    return;
                }

                await carregarComunicados(true);

                return;
            }

            const mensagens = {

                rejeitado:
                    "Sua solicitação de ingresso não está " +
                    "habilitada para acessar a comunidade.",

                sem_cadastro:
                    "Não encontramos sua manifestação " +
                    "de interesse na COJURIS.",

                sem_permissao:
                    "Não foi possível autorizar seu acesso."
            };

            mostrarMensagemAcesso(
                mensagens[perfil] ||
                "Acesso não autorizado."
            );

        } catch (erro) {

            if (sessaoAtual !== versaoSessao) {
                return;
            }

            console.error(
                "COJURIS — Autorização ou dispensas:",
                erro.code || erro.message
            );

            mostrarMensagemAcesso(
                "Não foi possível verificar suas permissões " +
                "ou sincronizar os comunicados. " +
                "Confira sua conexão e tente novamente."
            );
        }
    },

    erro => {

        console.error(
            "COJURIS — Autenticação:",
            erro
        );

        mostrarMensagemAcesso(
            "Não foi possível verificar sua sessão."
        );
    }
);


// ============================================================
// 12 — EVENTOS DOS BOTÕES
// ============================================================

// Atualiza a listagem a partir do Firestore.

btnAtualizar.addEventListener(
    "click",
    async () => {

        await carregarComunicados(true);
    }
);


// Carrega a próxima página da listagem.

btnCarregarMais.addEventListener(
    "click",
    async () => {

        if (!terminouListagem) {

            await carregarComunicados(false);
        }
    }
);
