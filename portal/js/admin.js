
/* ============================================================
   COJURIS — PAINEL ADMINISTRATIVO

   ARQUIVO: portal/js/admin.js

   FUNCIONALIDADES:

   01 — Importações do Firebase
   02 — Referências aos elementos HTML
   03 — Estado da aplicação
   04 — Mensagens e controle da interface
   05 — Autorização administrativa
   06 — Leitura dos interessados
   07 — Indicadores e filtros
   08 — Cartões dos interessados
   09 — Aprovação e rejeição
   10 — Verificação profissional
   11 — Seleção individual
   12 — Exclusão de registro
   13 — Limpeza e atualização
   14 — Encerramento de sessão

   IMPORTANTE:
   A exclusão aqui remove documentos do Firestore.
   Não exclui contas do Firebase Authentication.

   As regras do Firestore também devem ser atualizadas.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS HTML
// ============================================================

const mensagem = document.getElementById("admin-mensagem");

const lista = document.getElementById("lista-interessados");

const btnSair = document.getElementById("admin-sair");

const btnLimpar = document.getElementById("btn-limpar-tela");

const btnRecarregar = document.getElementById(
    "btn-recarregar-lista"
);

const btnExcluir = document.getElementById(
    "btn-excluir-selecionado"
);

const selecionarTodos = document.getElementById(
    "selecionar-todos"
);

const contadorSelecao = document.getElementById(
    "contador-selecao"
);

const campoPesquisa = document.getElementById(
    "admin-pesquisa"
);

const filtroStatus = document.getElementById(
    "admin-filtro-status"
);

const telaGestao = document.getElementById(
    "gestao-interessados"
);

const telaAcesso = document.getElementById(
    "admin-acesso"
);

const mensagemAcesso = document.getElementById(
    "admin-acesso-mensagem"
);


// ============================================================
// 03 — ESTADO DA APLICAÇÃO
//
// Mantemos os dados em memória para permitir filtros
// sem consultar novamente o Firebase a cada digitação.
//
// A seleção é armazenada em um Set, evitando UID
// repetido.
// ============================================================

let administradorAtual = null;

let acessoAutorizado = false;

let operacaoEmAndamento = false;

let interessados = [];

const selecionados = new Set();


// ============================================================
// 04 — FUNÇÕES AUXILIARES
// ============================================================

function definirMensagem(texto) {

    mensagem.textContent = texto;
}


function definirTexto(id, texto) {

    const elemento = document.getElementById(id);

    if (elemento) {
        elemento.textContent = String(texto);
    }
}


// Mostra ou oculta as ferramentas de administração.

function atualizarFerramentas() {

    const habilitar = (
        acessoAutorizado &&
        !operacaoEmAndamento
    );

    btnSair.disabled = !habilitar;

    btnLimpar.disabled = !habilitar;

    btnRecarregar.disabled = !habilitar;

    campoPesquisa.disabled = !habilitar;

    filtroStatus.disabled = !habilitar;

    selecionarTodos.disabled = !habilitar;

    btnExcluir.disabled = (
        !habilitar ||
        selecionados.size !== 1
    );
}


// Exibe uma mensagem quando o acesso não foi liberado.

function bloquearPainel(texto) {

    acessoAutorizado = false;

    administradorAtual = null;

    interessados = [];

    selecionados.clear();

    lista.replaceChildren();

    telaGestao.hidden = true;

    telaAcesso.hidden = false;

    mensagemAcesso.textContent = texto;

    atualizarFerramentas();
}


// Libera a visualização da administração.

function liberarPainel() {

    acessoAutorizado = true;

    telaAcesso.hidden = true;

    telaGestao.hidden = false;

    atualizarFerramentas();
}


// ============================================================
// 05 — VERIFICAÇÃO ADMINISTRATIVA
//
// Apenas usuários que possuam um documento ativo
// em administradores/{uid} poderão acessar.
//
// O próprio JavaScript não concede privilégios.
// ============================================================

async function verificarAdministrador(usuario) {

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
// 06 — OBSERVADOR DE AUTENTICAÇÃO
// ============================================================

onAuthStateChanged(

    auth,

    async (usuario) => {

        if (!usuario) {

            window.location.replace("./index.html");

            return;
        }

        bloquearPainel(
            "Verificando suas permissões administrativas..."
        );

        try {

            const ehAdministrador =
                await verificarAdministrador(usuario);

            if (!ehAdministrador) {

                bloquearPainel(
                    "Acesso não autorizado. " +
                    "Esta área é exclusiva da administração."
                );

                return;
            }

            administradorAtual = usuario;

            liberarPainel();

            await carregarInteressados();

        } catch (erro) {

            console.error(
                "Erro de autorização:",
                erro.code || erro.message
            );

            bloquearPainel(
                "Não foi possível verificar suas permissões."
            );
        }
    },

    (erro) => {

        console.error("Erro na autenticação:", erro);

        bloquearPainel(
            "Não foi possível verificar sua sessão."
        );
    }

);


// ============================================================
// 07 — CONSULTAR OS INTERESSADOS
//
// A leitura utiliza a coleção existente:
//
// interessados/{uid}
//
// Nesta versão inicial carregamos a lista completa.
//
// Para milhares de participantes, implementaremos
// paginação e consultas por filtros no Firestore.
// ============================================================

async function carregarInteressados() {

    if (!acessoAutorizado) return;

    definirMensagem("Carregando solicitações...");

    operacaoEmAndamento = true;

    atualizarFerramentas();

    try {

        const resultado = await getDocs(
            collection(db, "interessados")
        );

        interessados = resultado.docs.map((documento) => {

            return {
                uid: documento.id,
                ...documento.data()
            };
        });


        // Ordenar alfabeticamente por nome.

        interessados.sort((a, b) => {

            return String(a.nome || "").localeCompare(
                String(b.nome || ""),
                "pt-BR"
            );
        });


        // Uma nova consulta limpa a seleção anterior.

        selecionados.clear();

        atualizarIndicadores();

        renderizarInteressados();

        definirMensagem(
            `${interessados.length} cadastro(s) consultado(s).`
        );

    } catch (erro) {

        console.error(
            "Erro ao consultar interessados:",
            erro.code || erro.message
        );

        interessados = [];

        selecionados.clear();

        atualizarIndicadores();

        lista.replaceChildren();

        definirMensagem(
            "Não foi possível consultar os interessados."
        );

    } finally {

        operacaoEmAndamento = false;

        atualizarFerramentas();
    }
}


// ============================================================
// 08 — INDICADORES ADMINISTRATIVOS
// ============================================================

function atualizarIndicadores() {

    const pendentes = interessados.filter(
        (item) => item.status === "pendente"
    ).length;

    const aprovados = interessados.filter(
        (item) => item.status === "aprovado"
    ).length;

    const verificados = interessados.filter(
        (item) =>
            item.verificacaoProfissional === "verificada"
    ).length;


    definirTexto(
        "total-interessados",
        interessados.length
    );

    definirTexto(
        "total-pendentes",
        pendentes
    );

    definirTexto(
        "total-aprovados",
        aprovados
    );

    definirTexto(
        "total-verificados",
        verificados
    );
}


// ============================================================
// 09 — PESQUISA E FILTRAGEM
//
// Os filtros são aplicados somente aos registros
// carregados na memória.
// ============================================================

function obterInteressadosVisiveis() {

    const pesquisa = campoPesquisa.value
        .trim()
        .toLocaleLowerCase("pt-BR");

    const situacao = filtroStatus.value;

    return interessados.filter((item) => {

        const nome = String(item.nome || "")
            .toLocaleLowerCase("pt-BR");

        const email = String(item.email || "")
            .toLocaleLowerCase("pt-BR");

        const correspondePesquisa = (
            nome.includes(pesquisa) ||
            email.includes(pesquisa)
        );

        const correspondeStatus = (
            situacao === "todos" ||
            item.status === situacao
        );

        return (
            correspondePesquisa &&
            correspondeStatus
        );
    });
}


// ============================================================
// 10 — CONSTRUÇÃO SEGURA DOS ELEMENTOS
//
// Utilizamos textContent em vez de inserir dados
// de usuários por innerHTML.
//
// Isso evita interpretar nomes e e-mails
// como código HTML.
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
// 11 — RENDERIZAR A LISTA
// ============================================================

function renderizarInteressados() {

    lista.replaceChildren();

    const visiveis = obterInteressadosVisiveis();


    if (visiveis.length === 0) {

        lista.appendChild(
            criarElemento(
                "p",
                "admin-vazio",
                "Nenhum interessado encontrado."
            )
        );

    } else {

        const fragmento = document.createDocumentFragment();

        visiveis.forEach((dados) => {

            fragmento.appendChild(
                criarCartao(dados)
            );
        });

        lista.appendChild(fragmento);
    }


    atualizarSelecao();

    atualizarFerramentas();
}


// ============================================================
// 12 — CRIAR CARTÃO INDIVIDUAL
// ============================================================

function criarCartao(dados) {

    const cartao = criarElemento(
        "article",
        "admin-card"
    );

    cartao.dataset.uid = dados.uid;


    // --------------------------------------------
    // 12.1 — CABEÇALHO E SELEÇÃO
    // --------------------------------------------

    const cabecalho = criarElemento(
        "div",
        "admin-card-cabecalho"
    );

    const controle = criarElemento(
        "label",
        "admin-card-selecao"
    );

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.className = "checkbox-interessado";

    checkbox.value = dados.uid;

    checkbox.checked = selecionados.has(dados.uid);

    checkbox.setAttribute(
        "aria-label",
        `Selecionar registro de ${dados.nome || "interessado"}`
    );

    checkbox.addEventListener("change", () => {

        if (checkbox.checked) {

            selecionados.add(dados.uid);

        } else {

            selecionados.delete(dados.uid);
        }

        atualizarSelecao();
    });

    controle.append(
        checkbox,
        criarElemento("span", "", "Selecionar")
    );


    const titulo = criarElemento(
        "h3",
        "",
        dados.nome || "Nome não informado"
    );

    cabecalho.append(controle, titulo);


    // --------------------------------------------
    // 12.2 — DADOS DO INTERESSADO
    // --------------------------------------------

    const email = criarElemento(
        "p",
        "",
        `E-mail: ${dados.email || "Não informado"}`
    );

    const oab = criarElemento(
        "p",
        "",
        dados.oab
            ? `OAB (cadastro antigo): ${dados.oab}`
            : "OAB: não informada no cadastro inicial"
    );

    const status = criarElemento(
        "p",
        "admin-dado-status",
        `Situação: ${dados.status || "indefinida"}`
    );


    // --------------------------------------------
    // 12.3 — DECLARAÇÃO PROFISSIONAL
    // --------------------------------------------

    let textoDeclaracao;

    if (dados.declaracaoAdvogado === true) {

        textoDeclaracao =
            "Declaração profissional: registrada";

    } else if (dados.oab) {

        textoDeclaracao =
            "Cadastro anterior à autodeclaração";

    } else {

        textoDeclaracao =
            "Declaração profissional: não identificada";
    }

    const declaracao = criarElemento(
        "p",
        "",
        textoDeclaracao
    );


    // --------------------------------------------
    // 12.4 — VERIFICAÇÃO PROFISSIONAL
    // --------------------------------------------

    const verificado =
        dados.verificacaoProfissional === "verificada";

    const verificacao = criarElemento(
        "p",
        verificado
            ? "admin-verificacao verificada"
            : "admin-verificacao nao-verificada",
        verificado
            ? "Profissional verificado"
            : "Identidade profissional não verificada"
    );


    // --------------------------------------------
    // 12.5 — AÇÕES DO CADASTRO
    // --------------------------------------------

    const acoes = criarElemento(
        "div",
        "admin-acoes"
    );


    // Aprovação e rejeição permanecem disponíveis
    // somente para cadastros pendentes.

    if (dados.status === "pendente") {

        const aprovar = criarElemento(
            "button",
            "btn-aprovar",
            "Aprovar"
        );

        aprovar.type = "button";

        aprovar.addEventListener("click", () => {

            alterarStatus(
                dados.uid,
                "aprovado",
                acoes
            );
        });


        const rejeitar = criarElemento(
            "button",
            "btn-rejeitar",
            "Rejeitar"
        );

        rejeitar.type = "button";

        rejeitar.addEventListener("click", () => {

            alterarStatus(
                dados.uid,
                "rejeitado",
                acoes
            );
        });

        acoes.append(aprovar, rejeitar);
    }


    // --------------------------------------------
    // 12.6 — VERIFICAR PROFISSIONAL
    //
    // Somente cadastro aprovado.
    // A conferência deve ocorrer previamente.
    // --------------------------------------------

    if (
        dados.status === "aprovado" &&
        !verificado
    ) {

        const verificar = criarElemento(
            "button",
            "btn-verificar",
            "Confirmar verificação profissional"
        );

        verificar.type = "button";

        verificar.addEventListener("click", () => {

            confirmarVerificacao(
                dados.uid,
                dados.nome,
                acoes
            );
        });

        acoes.appendChild(verificar);
    }


    cartao.append(
        cabecalho,
        email,
        oab,
        status,
        declaracao,
        verificacao
    );

    if (acoes.children.length > 0) {

        cartao.appendChild(acoes);
    }

    return cartao;
}


// ============================================================
// 13 — APROVAR OU REJEITAR
// ============================================================

async function alterarStatus(uid, novoStatus, acoes) {

    if (!acessoAutorizado || operacaoEmAndamento) {
        return;
    }

    const pergunta = novoStatus === "aprovado"
        ? "Confirma a aprovação desta solicitação?"
        : "Confirma a rejeição desta solicitação?";

    if (!window.confirm(pergunta)) return;


    operacaoEmAndamento = true;

    atualizarFerramentas();

    const botoes = acoes.querySelectorAll("button");

    botoes.forEach((botao) => {
        botao.disabled = true;
    });


    try {

        await updateDoc(
            doc(db, "interessados", uid),
            {
                status: novoStatus
            }
        );

        operacaoEmAndamento = false;

        await carregarInteressados();

    } catch (erro) {

        console.error(
            "Erro ao alterar status:",
            erro.code || erro.message
        );

        definirMensagem(
            "Não foi possível atualizar a situação cadastral."
        );

    } finally {

        operacaoEmAndamento = false;

        atualizarFerramentas();

        botoes.forEach((botao) => {
            botao.disabled = false;
        });
    }
}


// ============================================================
// 14 — VERIFICAÇÃO PROFISSIONAL
//
// ATENÇÃO:
//
// A confirmação deve ocorrer somente depois de
// consultar os registros oficiais da OAB e comprovar
// que o cadastro pertence ao profissional.
//
// O botão não consulta a OAB automaticamente.
//
// Campos gravados:
// - verificacaoProfissional
// - verificadoEm
// - verificadoPor
// ============================================================

async function confirmarVerificacao(uid, nome, acoes) {

    if (
        !acessoAutorizado ||
        !administradorAtual ||
        operacaoEmAndamento
    ) {
        return;
    }


    const confirmacao = window.confirm(
        `Você realizou a conferência profissional de ` +
        `${nome || "este interessado"} nos registros ` +
        `oficiais da OAB e confirmou a identidade ` +
        `do titular?\n\n` +
        `Selecione OK somente se a verificação ` +
        `foi efetivamente realizada.`
    );

    if (!confirmacao) return;


    operacaoEmAndamento = true;

    atualizarFerramentas();

    const botoes = acoes.querySelectorAll("button");

    botoes.forEach((botao) => {
        botao.disabled = true;
    });


    try {

        await updateDoc(
            doc(db, "interessados", uid),
            {
                verificacaoProfissional: "verificada",

                verificadoEm: serverTimestamp(),

                verificadoPor: administradorAtual.uid
            }
        );

        operacaoEmAndamento = false;

        await carregarInteressados();

        definirMensagem(
            "Verificação profissional registrada com sucesso."
        );

    } catch (erro) {

        console.error(
            "Erro na verificação:",
            erro.code || erro.message
        );

        definirMensagem(
            "Não foi possível registrar a verificação profissional."
        );

    } finally {

        operacaoEmAndamento = false;

        atualizarFerramentas();

        botoes.forEach((botao) => {
            botao.disabled = false;
        });
    }
}


// ============================================================
// 15 — CONTROLE DE SELEÇÃO
// ============================================================

function atualizarSelecao() {

    const quantidade = selecionados.size;

    contadorSelecao.textContent = quantidade === 0
        ? "Nenhum selecionado"
        : quantidade === 1
            ? "1 registro selecionado"
            : `${quantidade} registros selecionados`;


    const visiveis = obterInteressadosVisiveis();

    const idsVisiveis = visiveis.map(
        (item) => item.uid
    );


    selecionarTodos.checked = (
        idsVisiveis.length > 0 &&
        idsVisiveis.every(
            (uid) => selecionados.has(uid)
        )
    );


    const marcados = idsVisiveis.filter(
        (uid) => selecionados.has(uid)
    ).length;

    selecionarTodos.indeterminate = (
        marcados > 0 &&
        marcados < idsVisiveis.length
    );

    atualizarFerramentas();
}


// Selecionar ou desmarcar os itens visíveis.

selecionarTodos.addEventListener("change", () => {

    if (!acessoAutorizado || operacaoEmAndamento) {
        return;
    }

    const visiveis = obterInteressadosVisiveis();

    visiveis.forEach((item) => {

        if (selecionarTodos.checked) {

            selecionados.add(item.uid);

        } else {

            selecionados.delete(item.uid);
        }
    });

    renderizarInteressados();
});


// ============================================================
// 16 — EXCLUSÃO DO REGISTRO SELECIONADO
//
// REGRAS:
//
// 1. Somente um registro por operação.
// 2. Exige confirmação explícita.
// 3. Não permite excluir o registro do próprio admin.
// 4. Exclui somente o documento do Firestore.
//
// A conta no Authentication permanece existente.
// ============================================================

async function excluirRegistroSelecionado() {

    if (
        !acessoAutorizado ||
        !administradorAtual ||
        operacaoEmAndamento
    ) {
        return;
    }


    if (selecionados.size !== 1) {

        definirMensagem(
            "Selecione exatamente um cadastro para excluir."
        );

        return;
    }


    const uid = [...selecionados][0];

    if (uid === administradorAtual.uid) {

        definirMensagem(
            "Não é permitido excluir seu próprio registro administrativo."
        );

        return;
    }


    const interessado = interessados.find(
        (item) => item.uid === uid
    );

    if (!interessado) {

        definirMensagem(
            "O registro selecionado não está disponível."
        );

        return;
    }


    // Confirmação forte: digitando a palavra EXCLUIR.

    const resposta = window.prompt(
        `Você está prestes a excluir o registro de:\n\n` +
        `${interessado.nome || "Interessado"}\n` +
        `${interessado.email || ""}\n\n` +
        `O documento será removido do Firestore.\n` +
        `A conta no Authentication permanecerá ativa.\n\n` +
        `Para confirmar, digite EXCLUIR:`
    );


    if (resposta !== "EXCLUIR") {

        definirMensagem(
            "Exclusão cancelada. Nenhum documento foi removido."
        );

        return;
    }


    operacaoEmAndamento = true;

    atualizarFerramentas();


    try {

        await deleteDoc(
            doc(db, "interessados", uid)
        );

        operacaoEmAndamento = false;

        await carregarInteressados();

        definirMensagem(
            "Registro excluído do Firestore. " +
            "A conta de autenticação não foi excluída."
        );

    } catch (erro) {

        console.error(
            "Erro ao excluir registro:",
            erro.code || erro.message
        );

        definirMensagem(
            "Não foi possível excluir o registro. " +
            "Verifique suas permissões."
        );

    } finally {

        operacaoEmAndamento = false;

        atualizarFerramentas();
    }
}


// ============================================================
// 17 — EVENTOS DA INTERFACE
// ============================================================

// Pesquisar sem consultar o Firestore novamente.

campoPesquisa.addEventListener("input", () => {

    if (!acessoAutorizado) return;

    renderizarInteressados();
});


// Alterar o filtro por situação cadastral.

filtroStatus.addEventListener("change", () => {

    if (!acessoAutorizado) return;

    renderizarInteressados();
});


// Limpar somente a apresentação visual.
//
// Os documentos continuam no Firestore.

btnLimpar.addEventListener("click", () => {

    if (!acessoAutorizado || operacaoEmAndamento) {
        return;
    }

    lista.replaceChildren();

    selecionados.clear();

    selecionarTodos.checked = false;

    selecionarTodos.indeterminate = false;

    atualizarSelecao();

    definirMensagem(
        "A visualização foi limpa. " +
        "Os cadastros permanecem no Firebase."
    );
});


// Recarregar os documentos.

btnRecarregar.addEventListener("click", async () => {

    if (!acessoAutorizado || operacaoEmAndamento) {
        return;
    }

    await carregarInteressados();
});


// Excluir o registro selecionado.

btnExcluir.addEventListener(
    "click",
    excluirRegistroSelecionado
);


// ============================================================
// 18 — ENCERRAR SESSÃO
// ============================================================

btnSair.addEventListener("click", async () => {

    if (!acessoAutorizado || operacaoEmAndamento) {
        return;
    }

    btnSair.disabled = true;

    try {

        await signOut(auth);

        window.location.replace("./index.html");

    } catch (erro) {

        console.error(
            "Erro ao encerrar sessão:",
            erro.code || erro.message
        );

        definirMensagem(
            "Não foi possível encerrar a sessão."
        );

        btnSair.disabled = false;
    }
});
