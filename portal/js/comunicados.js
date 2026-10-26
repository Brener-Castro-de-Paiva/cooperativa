
/* ============================================================
   COJURIS — COMUNICADOS OFICIAIS

   ARQUIVO: portal/js/comunicados.js

   01 — Firebase
   02 — Elementos
   03 — Estado
   04 — Permissões
   05 — Autenticação
   06 — Publicação
   07 — Consulta paginada
   08 — Construção dos cartões
   09 — Exclusão
   10 — Eventos

   A segurança efetiva é aplicada também
   nas regras do Firestore.
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
    addDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit,
    startAfter,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS HTML
// ============================================================

const telaAcesso = document.getElementById("tela-acesso");
const mensagemAcesso = document.getElementById("mensagem-acesso");

const aplicacao = document.getElementById("aplicacao");

const areaPublicacao = document.getElementById(
    "area-publicacao"
);

const linkAdministracao = document.getElementById(
    "link-administracao"
);

const perfilAcesso = document.getElementById("perfil-acesso");

const quantidade = document.getElementById(
    "quantidade-comunicados"
);

const formulario = document.getElementById(
    "form-comunicado"
);

const campoTitulo = document.getElementById(
    "titulo-comunicado"
);

const campoConteudo = document.getElementById(
    "conteudo-comunicado"
);

const btnPublicar = document.getElementById("btn-publicar");

const btnAtualizar = document.getElementById(
    "btn-atualizar"
);

const btnCarregarMais = document.getElementById(
    "btn-carregar-mais"
);

const lista = document.getElementById("lista-comunicados");

const mensagemLista = document.getElementById(
    "mensagem-listagem"
);


// ============================================================
// 03 — ESTADO DA APLICAÇÃO
// ============================================================

const TAMANHO_PAGINA = 10;

let usuarioAtual = null;

let perfilAtual = null;

let ultimoDocumento = null;

let terminouListagem = false;

let carregando = false;

let publicando = false;

let totalExibido = 0;


// ============================================================
// 04 — FUNÇÕES DE INTERFACE
// ============================================================

function mostrarBloqueio(texto) {

    aplicacao.hidden = true;

    telaAcesso.hidden = false;

    mensagemAcesso.textContent = texto;
}


function liberarInterface(perfil) {

    perfilAtual = perfil;

    telaAcesso.hidden = true;

    aplicacao.hidden = false;

    const admin = perfil === "administrador";

    areaPublicacao.hidden = !admin;

    linkAdministracao.hidden = !admin;

    const nomes = {
        administrador: "Administração",
        participante: "Profissional verificado",
        leitor: "Acesso de leitura"
    };

    perfilAcesso.textContent = nomes[perfil];

    btnAtualizar.disabled = false;
}


function mostrarMensagem(texto) {
    mensagemLista.textContent = texto;
}


function atualizarQuantidade() {

    quantidade.textContent =
        `${totalExibido} comunicado(s) exibido(s)`;
}


// ============================================================
// 05 — VERIFICAÇÃO DO ADMINISTRADOR
// ============================================================

async function verificarAdmin(usuario) {

    const referencia = doc(
        db,
        "administradores",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    return resultado.exists() &&
           resultado.data().ativo === true;
}


// ============================================================
// 06 — CLASSIFICAÇÃO DO USUÁRIO
//
// A leitura é permitida para cadastros pendentes
// ou aprovados.
//
// Rejeitados não têm acesso.
//
// Administradores ativos são autorizados
// independentemente de cadastro de interessado.
// ============================================================

async function consultarPerfil(usuario) {

    if (await verificarAdmin(usuario)) {
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
// 07 — OBSERVAÇÃO DA AUTENTICAÇÃO
// ============================================================

onAuthStateChanged(

    auth,

    async (usuario) => {

        // Oculta imediatamente dados de uma sessão anterior.

        aplicacao.hidden = true;

        areaPublicacao.hidden = true;

        lista.replaceChildren();

        perfilAtual = null;
        usuarioAtual = null;

        ultimoDocumento = null;
        terminouListagem = false;
        totalExibido = 0;

        if (!usuario) {

            window.location.replace("./index.html");
            return;
        }

        mostrarBloqueio("Verificando sua autorização...");

        try {

            const perfil = await consultarPerfil(usuario);

            if (
                perfil !== "administrador" &&
                perfil !== "participante" &&
                perfil !== "leitor"
            ) {

                mostrarBloqueio(
                    "Sua conta não possui autorização " +
                    "para acessar os comunicados."
                );

                return;
            }

            usuarioAtual = usuario;

            liberarInterface(perfil);

            await carregarComunicados(true);

        } catch (erro) {

            console.error(
                "Erro de acesso:",
                erro.code || erro.message
            );

            mostrarBloqueio(
                "Não foi possível verificar seu acesso."
            );
        }
    },

    (erro) => {

        console.error("Autenticação:", erro);

        mostrarBloqueio(
            "Não foi possível verificar sua sessão."
        );
    }
);


// ============================================================
// 08 — PUBLICAÇÃO ADMINISTRATIVA
//
// Os comunicados são armazenados em:
//
// comunicados/{id}
//
// Campos:
// titulo, conteudo, autorUid, publicadoEm
// ============================================================

async function publicarComunicado(evento) {

    evento.preventDefault();

    if (
        perfilAtual !== "administrador" ||
        !usuarioAtual ||
        publicando
    ) {
        return;
    }

    const titulo = campoTitulo.value.trim();

    const conteudo = campoConteudo.value.trim();

    if (titulo.length < 5 || titulo.length > 150) {

        mostrarMensagem(
            "O título deve conter entre 5 e 150 caracteres."
        );

        return;
    }

    if (
        conteudo.length < 10 ||
        conteudo.length > 10000
    ) {

        mostrarMensagem(
            "O conteúdo deve conter entre 10 e 10.000 caracteres."
        );

        return;
    }

    if (
        !window.confirm(
            "Confirma a publicação deste comunicado?"
        )
    ) {
        return;
    }

    publicando = true;

    btnPublicar.disabled = true;

    mostrarMensagem("Publicando comunicado...");

    try {

        await addDoc(
            collection(db, "comunicados"),
            {
                titulo: titulo,
                conteudo: conteudo,
                autorUid: usuarioAtual.uid,
                publicadoEm: serverTimestamp()
            }
        );

        formulario.reset();

        await carregarComunicados(true);

        mostrarMensagem(
            "Comunicado publicado com sucesso."
        );

    } catch (erro) {

        console.error(
            "Erro de publicação:",
            erro.code || erro.message
        );

        mostrarMensagem(
            "Não foi possível publicar o comunicado."
        );

    } finally {

        publicando = false;

        btnPublicar.disabled = false;
    }
}


// ============================================================
// 09 — LEITURA PAGINADA
//
// Consulta os comunicados mais recentes primeiro.
//
// Carrega somente 10 documentos por vez.
// ============================================================

async function carregarComunicados(reiniciar = false) {

    if (
        !perfilAtual ||
        carregando
    ) {
        return;
    }

    carregando = true;

    btnAtualizar.disabled = true;

    btnCarregarMais.disabled = true;

    if (reiniciar) {

        ultimoDocumento = null;

        terminouListagem = false;

        totalExibido = 0;

        lista.replaceChildren();

        atualizarQuantidade();
    }

    mostrarMensagem("Carregando comunicados...");

    try {

        const referencia = collection(
            db,
            "comunicados"
        );

        let consulta;

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

        const resultado = await getDocs(consulta);

        resultado.forEach((documento) => {

            lista.appendChild(
                criarCartao(documento)
            );

            totalExibido++;
        });

        atualizarQuantidade();

        if (!resultado.empty) {

            ultimoDocumento =
                resultado.docs[resultado.docs.length - 1];
        }

        terminouListagem =
            resultado.size < TAMANHO_PAGINA;

        btnCarregarMais.hidden =
            terminouListagem || totalExibido === 0;

        if (totalExibido === 0) {

            mostrarMensagem(
                "Nenhum comunicado publicado."
            );

        } else {

            mostrarMensagem(
                "Comunicados carregados."
            );
        }

    } catch (erro) {

        console.error(
            "Erro ao consultar comunicados:",
            erro.code || erro.message
        );

        mostrarMensagem(
            "Não foi possível consultar os comunicados."
        );

    } finally {

        carregando = false;

        btnAtualizar.disabled = false;

        btnCarregarMais.disabled = false;
    }
}


// ============================================================
// 10 — CRIAÇÃO SEGURA DE ELEMENTOS
//
// textContent não interpreta HTML enviado
// como conteúdo executável.
// ============================================================

function elemento(tag, classe, texto) {

    const novo = document.createElement(tag);

    if (classe) {
        novo.className = classe;
    }

    if (texto !== undefined) {
        novo.textContent = String(texto);
    }

    return novo;
}


// ============================================================
// 11 — FORMATAÇÃO DE DATA
// ============================================================

function formatarData(timestamp) {

    if (!timestamp || !timestamp.toDate) {
        return "Publicação institucional";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "long",
            timeStyle: "short"
        }
    ).format(timestamp.toDate());
}


// ============================================================
// 12 — CRIAR CARTÃO DE COMUNICADO
// ============================================================

function criarCartao(documento) {

    const dados = documento.data();

    const cartao = elemento(
        "article",
        "cartao-comunicado"
    );

    const cabecalho = elemento(
        "div",
        "cartao-cabecalho"
    );

    const identificacao = elemento(
        "div",
        "cartao-identificacao"
    );

    identificacao.append(
        elemento("span", "marca-publicacao", "✦"),
        elemento("strong", "", "COJURIS")
    );

    const data = elemento(
        "time",
        "data-publicacao",
        formatarData(dados.publicadoEm)
    );

    if (dados.publicadoEm?.toDate) {

        data.dateTime =
            dados.publicadoEm.toDate().toISOString();
    }

    cabecalho.append(identificacao, data);


    const titulo = elemento(
        "h3",
        "titulo-comunicado",
        dados.titulo || "Comunicado"
    );

    const conteudo = elemento(
        "p",
        "conteudo-comunicado",
        dados.conteudo || ""
    );

    cartao.append(cabecalho, titulo, conteudo);


    // Apenas administradores visualizam exclusão.

    if (perfilAtual === "administrador") {

        const acoes = elemento(
            "div",
            "acoes-comunicado"
        );

        const botaoExcluir = elemento(
            "button",
            "botao-excluir",
            "Excluir comunicado"
        );

        botaoExcluir.type = "button";

        botaoExcluir.addEventListener(
            "click",
            () => excluirComunicado(
                documento.id,
                dados.titulo,
                botaoExcluir
            )
        );

        acoes.appendChild(botaoExcluir);

        cartao.appendChild(acoes);
    }

    return cartao;
}


// ============================================================
// 13 — EXCLUSÃO ADMINISTRATIVA
//
// A exclusão exige confirmação explícita.
//
// Não é permitida para leitores e participantes.
// ============================================================

async function excluirComunicado(id, titulo, botao) {

    if (
        perfilAtual !== "administrador" ||
        !usuarioAtual
    ) {
        return;
    }

    const confirmacao = window.prompt(
        `Excluir o comunicado:\n\n${titulo}\n\n` +
        `Esta ação remove a publicação da comunidade.\n` +
        `Digite EXCLUIR para confirmar:`
    );

    if (confirmacao !== "EXCLUIR") {
        return;
    }

    botao.disabled = true;

    try {

        await deleteDoc(
            doc(db, "comunicados", id)
        );

        await carregarComunicados(true);

        mostrarMensagem(
            "Comunicado excluído com sucesso."
        );

    } catch (erro) {

        console.error(
            "Erro na exclusão:",
            erro.code || erro.message
        );

        mostrarMensagem(
            "Não foi possível excluir o comunicado."
        );

        botao.disabled = false;
    }
}


// ============================================================
// 14 — EVENTOS
// ============================================================

formulario.addEventListener(
    "submit",
    publicarComunicado
);


btnAtualizar.addEventListener(
    "click",
    () => carregarComunicados(true)
);


btnCarregarMais.addEventListener(
    "click",
    () => {

        if (!terminouListagem) {
            carregarComunicados(false);
        }
    }
);
